use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;

use log::{debug, error};
use reqwest::Client;
use warp::http::{HeaderMap, HeaderValue, Method, Response, StatusCode};
use warp::hyper::Body;
use warp::reply::Reply;
use warp::Filter;
use futures_util::{stream, StreamExt, TryStreamExt};
use warp::hyper::body::Bytes;

const START_PORT: u16 = 5001;
const MAX_PORT: u16 = 5100;

pub struct ProxyServer {
    pub port: u16
}

impl ProxyServer {
    pub async fn new() -> Self {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap();
        let relay_client = client.clone();
        let ptoxy_client = client.clone();
        let assets_client = client.clone();

        let relay_filter = warp::path("relay")
            .and(warp::path::tail())
            .and(warp::method())
            .and(warp::header::headers_cloned())
            .and(warp::query::raw().or(warp::any().map(String::new)).unify())
            .and(warp::body::bytes())
            .and_then(move |tail: warp::path::Tail, method: Method, headers: HeaderMap, query: String, body: Bytes| {
                let client = relay_client.clone();
                async move {
                    let segments: Vec<&str> = tail.as_str().split('/').filter(|segment| !segment.is_empty()).collect();
                    if segments.len() < 2 {
                        return Ok::<_, Infallible>(cors_response(
                            Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .body(Body::from("缺少转发目标"))
                                .unwrap()
                        ));
                    }

                    if method == Method::OPTIONS {
                        return Ok::<_, Infallible>(preflight_response());
                    }

                    let scheme = segments[0];
                    let host = segments[1];
                    let path = if segments.len() > 2 {
                        format!("/{}", segments[2..].join("/"))
                    } else {
                        String::new()
                    };
                    let mut target_url = format!("{}://{}{}", scheme, host, path);
                    if !query.is_empty() {
                        target_url.push('?');
                        target_url.push_str(&query);
                    }
                    debug!("relay proxy {} {}", method, target_url);

                    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
                        .unwrap_or(reqwest::Method::GET);
                    let mut request_builder = client.request(reqwest_method, &target_url);
                    for (name, value) in headers.iter() {
                        let header_name = name.as_str().to_ascii_lowercase();
                        if matches!(header_name.as_str(), "host" | "origin" | "referer" | "content-length" | "connection") {
                            continue;
                        }
                        if let Ok(value_str) = value.to_str() {
                            request_builder = request_builder.header(name.as_str(), value_str);
                        }
                    }
                    if !body.is_empty() {
                        request_builder = request_builder.body(body);
                    }

                    match request_builder.send().await {
                        Ok(response) => {
                            let status = response.status().as_u16();
                            debug!("relay upstream {} {}", status, target_url);
                            let response_headers = response.headers().clone();
                            let content_type = response_headers
                                .get("content-type")
                                .and_then(|value| value.to_str().ok())
                                .unwrap_or("")
                                .to_string();

                            if status >= 400 {
                                let body_bytes = response.bytes().await.unwrap_or_default();
                                let body_preview = String::from_utf8_lossy(&body_bytes);
                                error!(
                                    "relay upstream error {} {} body={}",
                                    status,
                                    target_url,
                                    body_preview
                                );

                                let mut builder = Response::builder().status(status);
                                for (name, value) in response_headers.iter() {
                                    let header_name = name.as_str().to_ascii_lowercase();
                                    if matches!(header_name.as_str(), "content-length" | "connection" | "access-control-allow-origin" | "access-control-allow-headers" | "access-control-allow-methods") {
                                        continue;
                                    }
                                    if let Ok(value_str) = value.to_str() {
                                        builder = builder.header(name.as_str(), value_str);
                                    }
                                }

                                return Ok::<_, Infallible>(cors_response(
                                    builder.body(Body::from(body_bytes)).unwrap()
                                ));
                            }

                            let mut builder = Response::builder().status(status);
                            for (name, value) in response_headers.iter() {
                                let header_name = name.as_str().to_ascii_lowercase();
                                if matches!(header_name.as_str(), "content-length" | "connection" | "access-control-allow-origin" | "access-control-allow-headers" | "access-control-allow-methods") {
                                    continue;
                                }
                                if let Ok(value_str) = value.to_str() {
                                    builder = builder.header(name.as_str(), value_str);
                                }
                            }

                            let mut upstream_stream = response.bytes_stream();
                            let first_chunk = upstream_stream
                                .try_next()
                                .await
                                .unwrap_or(None);

                            if target_url.contains("/responses") {
                                let first_preview = first_chunk
                                    .as_ref()
                                    .map(|chunk| String::from_utf8_lossy(&chunk[..chunk.len().min(240)]).to_string())
                                    .unwrap_or_default();
                            }

                            let combined_stream = match first_chunk {
                                Some(chunk) => stream::once(async move { Ok::<_, std::io::Error>(chunk) })
                                    .chain(upstream_stream.map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err.to_string())))
                                    .left_stream(),
                                None => upstream_stream
                                    .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err.to_string()))
                                    .right_stream(),
                            };
                            let body = Body::wrap_stream(combined_stream);

                            Ok::<_, Infallible>(cors_response(builder.body(body).unwrap()))
                        }
                        Err(err) => {
                            error!("relay proxy failed {}: {}", target_url, err);
                            Ok::<_, Infallible>(cors_response(
                                Response::builder()
                                    .status(StatusCode::BAD_GATEWAY)
                                    .body(Body::from(format!("请求失败: {}", err)))
                                    .unwrap()
                            ))
                        }
                    }
                }
            });

        let proxy_filter = warp::path("proxy")
            .and(warp::query::<HashMap<String, String>>())
            .and_then({
                let client = ptoxy_client;
                move |params: HashMap<String, String>| {
                    let client = client.clone();
                    async move {
                        if let Some(target_url) = params.get("url") {
                            match client.get(target_url).send().await {
                                Ok(response) => {
                                    let mut res = warp::http::Response::builder()
                                        .status(warp::http::StatusCode::from_u16(response.status().as_u16()).unwrap());

                                    let body = response.bytes().await.unwrap_or_default();

                                    res = res
                                        .header("Access-Control-Allow-Origin", "*")
                                        .header("X-Frame-Options", "")
                                        .header("Content-Type", "text/html; charset=utf-8");

                                    Ok::<_, Infallible>(res.body(body).into_response())
                                }
                                Err(_) => Ok::<_, Infallible>(
                                    warp::reply::with_status("请求失败", warp::http::StatusCode::BAD_GATEWAY)
                                        .into_response(),
                                ),
                            }
                        } else {
                            Ok::<_, Infallible>(
                                warp::reply::with_status("未知的 URL", warp::http::StatusCode::BAD_REQUEST)
                                    .into_response(),
                            )
                        }
                    }
                }});

        let assets_filter = warp::path("assets")
            .and(warp::query::<HashMap<String, String>>())
            .and_then({
                let client = assets_client;
                move |params: HashMap<String, String>| {
                    let client = client.clone();
                    async move {
                        if let Some(target_url) = params.get("url") {
                            match client.get(target_url).send().await {
                                Ok(response) => {
                                    let content_type = response
                                        .headers()
                                        .get("Content-Type")
                                        .and_then(|v| v.to_str().ok())
                                        .unwrap_or("application/octet-stream")
                                        .to_string();

                                        let res = warp::http::Response::builder()
                                        .status(warp::http::StatusCode::from_u16(response.status().as_u16()).unwrap());

                                    let body = response.bytes().await.unwrap_or_default();

                                    let res = res
                                        .header("Content-Type", content_type)
                                        .header("Access-Control-Allow-Origin", "*");

                                    Ok::<_, Infallible>(res.body(body).into_response())
                                }
                                Err(_) => Ok::<_, Infallible>(
                                    warp::reply::with_status("请求失败", warp::http::StatusCode::BAD_GATEWAY)
                                        .into_response(),
                                ),
                            }
                        } else {
                            Ok::<_, Infallible>(
                                warp::reply::with_status(
                                    "缺少参数: url",
                                    warp::http::StatusCode::BAD_REQUEST,
                                )
                                .into_response(),
                            )
                        }
                    }
                }
            });

        let mut port = START_PORT;
        let routes = relay_filter.or(proxy_filter).or(assets_filter);

        loop {
            let addr: SocketAddr = ([127, 0, 0, 1], port).into();

            match warp::serve(routes.clone()).try_bind_ephemeral(addr) {
                Ok((_, server)) => {
                    tokio::spawn(server);
                    return Self { port };
                }
                Err(_) => {
                    port += 1;
                    if port > MAX_PORT {
                        panic!("❌ 本地反代服务无法绑定 {}-{}", START_PORT, MAX_PORT);
                    }
                }
            }
        }
    }
}

fn cors_response(mut response: Response<Body>) -> Response<Body> {
    let headers = response.headers_mut();
    headers.insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
    headers.insert("Access-Control-Allow-Methods", HeaderValue::from_static("GET, POST, PUT, PATCH, DELETE, OPTIONS"));
    headers.insert("Access-Control-Allow-Headers", HeaderValue::from_static("*"));
    headers.insert("Access-Control-Expose-Headers", HeaderValue::from_static("*"));
    response
}

fn preflight_response() -> Response<Body> {
    cors_response(
        Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap()
    )
}
