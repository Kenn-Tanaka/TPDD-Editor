#include "gateway/proxy.hpp"
#include "gateway/model_filter.hpp"
#include "gateway/model_router.hpp"
#include <condition_variable>
#include <deque>
#include <sstream>
#include <thread>

namespace gateway {

namespace {

bool iequals(std::string_view a, std::string_view b) {
  if (a.size() != b.size()) {
    return false;
  }
  for (std::size_t i = 0; i < a.size(); ++i) {
    auto ac = static_cast<unsigned char>(a[i]);
    auto bc = static_cast<unsigned char>(b[i]);
    if (std::tolower(ac) != std::tolower(bc)) {
      return false;
    }
  }
  return true;
}

bool excluded_request_header(std::string_view h) {
  return iequals(h, "Authorization") || iequals(h, "Proxy-Authorization") ||
         iequals(h, "Host") || iequals(h, "Content-Length") ||
         iequals(h, "Connection") || iequals(h, "Transfer-Encoding") ||
         iequals(h, "Keep-Alive") || iequals(h, "TE") ||
         iequals(h, "Trailer") || iequals(h, "Upgrade") ||
         iequals(h, "Proxy-Connection") || iequals(h, "Accept-Encoding");
}

bool excluded_response_header(std::string_view h) {
  return excluded_request_header(h) || iequals(h, "Set-Cookie");
}

std::string join_path(std::string base, std::string_view path) {
  if (base.empty()) {
    base = "/";
  }
  if (base != "/" && (path == base ||
                      (path.starts_with(base) && path.size() > base.size() &&
                       path[base.size()] == '/'))) {
    return std::string(path);
  }
  if (base.back() == '/' && path.starts_with('/')) {
    base.pop_back();
  } else if (base.back() != '/' && !path.starts_with('/')) {
    base.push_back('/');
  }
  return base + std::string(path);
}

void gateway_error(httplib::Response& res, int status, std::string_view type,
                   std::string_view message) {
  res.status = status;
  res.set_content(make_error(type, message), "application/json");
}

struct StreamState {
  std::mutex mutex;
  std::condition_variable cv;
  std::deque<std::string> chunks;
  bool headers_ready = false;
  bool done = false;
  bool cancelled = false;
  int status = 502;
  httplib::Headers headers;
  httplib::Error error = httplib::Error::Unknown;
};

} // namespace

ParsedUrl parse_base_url(const std::string& url) {
  auto scheme_end = url.find("://");
  if (scheme_end == std::string::npos) {
    throw std::runtime_error("invalid base URL");
  }
  ParsedUrl out{url.substr(0, scheme_end) == "https", {}, 0, {}};
  if (!out.https && url.substr(0, scheme_end) != "http") {
    throw std::runtime_error("unsupported URL scheme");
  }

  auto auth_start = scheme_end + 3;
  auto path_pos = url.find('/', auth_start);
  auto authority = url.substr(auth_start, path_pos - auth_start);
  if (authority.empty() || authority.find('@') != std::string::npos) {
    throw std::runtime_error("invalid base URL authority");
  }

  auto colon = authority.rfind(':');
  if (colon != std::string::npos) {
    out.host = authority.substr(0, colon);
    out.port = std::stoi(authority.substr(colon + 1));
  } else {
    out.host = authority;
    out.port = out.https ? 443 : 80;
  }
  out.base_path = path_pos == std::string::npos ? "" : url.substr(path_pos);
  return out;
}

bool constant_time_equal(std::string_view a, std::string_view b) noexcept {
  std::size_t n = a.size() > b.size() ? a.size() : b.size();
  unsigned char d = static_cast<unsigned char>(a.size() ^ b.size());
  for (std::size_t i = 0; i < n; ++i) {
    unsigned char x = i < a.size() ? static_cast<unsigned char>(a[i]) : 0;
    unsigned char y = i < b.size() ? static_cast<unsigned char>(b[i]) : 0;
    d |= x ^ y;
  }
  return d == 0;
}

std::string make_error(std::string_view type, std::string_view message) {
  return nlohmann::json{{"error", {{"type", type}, {"message", message}}}}.dump();
}

httplib::Headers filtered_request_headers(const httplib::Headers& in) {
  httplib::Headers out;
  for (const auto& [k, v] : in) {
    if (!excluded_request_header(k) && !iequals(k, "Cookie")) {
      out.emplace(k, v);
    }
  }
  return out;
}

httplib::Headers filtered_response_headers(const httplib::Headers& in) {
  httplib::Headers out;
  for (const auto& [k, v] : in) {
    if (!excluded_response_header(k)) {
      out.emplace(k, v);
    }
  }
  return out;
}

Proxy::Proxy(Config c, ICredentialStore& credentials, Logger& logger)
    : config_(std::move(c)),
      credentials_(credentials),
      resolver_(credentials, config_.credentials.service_name,
                config_.credentials.environment_fallback),
      logger_(logger) {}

bool Proxy::authenticate(const httplib::Request& req, httplib::Response& res) {
  if (!config_.security.client_auth) {
    return true;
  }
  std::optional<Secret> expected;
  try {
    expected = resolver_.resolve_named(config_.security.credential_name);
  } catch (...) {
    gateway_error(res, 503, "gateway_credential_error", "Credential Store is unavailable.");
    return false;
  }
  if (!expected) {
    gateway_error(res, 503, "gateway_credential_error", "Client credential is unavailable.");
    return false;
  }
  auto auth = req.get_header_value("Authorization");
  constexpr std::string_view prefix = "Bearer ";
  if (!auth.starts_with(prefix) ||
      !constant_time_equal(std::string_view(auth).substr(prefix.size()), expected->view())) {
    gateway_error(res, 401, "gateway_authentication_error", "Client authentication failed.");
    return false;
  }
  return true;
}

std::unique_ptr<httplib::Client> Proxy::client_for(const ProviderConfig& p) const {
  auto u = parse_base_url(p.base_url);
  auto origin = std::string(u.https ? "https://" : "http://") + u.host + ":" +
                std::to_string(u.port);
  auto c = std::make_unique<httplib::Client>(origin);
  c->set_connection_timeout(config_.proxy.connect_timeout_sec);
  c->set_read_timeout(config_.proxy.read_timeout_sec);
  c->set_write_timeout(config_.proxy.write_timeout_sec);
  c->set_follow_location(false);
  return c;
}

void Proxy::handle(const httplib::Request& request, httplib::Response& response) {
  auto started = std::chrono::steady_clock::now();
  if (!authenticate(request, response)) {
    return;
  }

  if (request.body.size() > config_.proxy.max_request_body_mb * 1024ULL * 1024ULL) {
    gateway_error(response, 413, "gateway_payload_too_large",
                  "Request body exceeds configured limit.");
    return;
  }

  auto content_type = request.get_header_value("Content-Type");
  if (content_type.find("application/json") == std::string::npos) {
    gateway_error(response, 400, "gateway_routing_unavailable",
                  "Provider routing information is unavailable for this non-JSON request.");
    return;
  }

  std::string gateway_model;
  std::string forwarded_body = request.body;
  nlohmann::json body;
  try {
    body = nlohmann::json::parse(request.body);
  } catch (...) {
    gateway_error(response, 400, "gateway_invalid_request", "Request JSON is invalid.");
    return;
  }

  if (!body.contains("model") || !body["model"].is_string()) {
    gateway_error(response, 400, "gateway_invalid_model", "The model field is required.");
    return;
  }
  gateway_model = body["model"].get<std::string>();

  auto route = route_model(gateway_model);
  if (!route) {
    gateway_error(response, 400, "gateway_invalid_model", "Model must be provider/model.");
    return;
  }

  auto pit = config_.providers.find(route->provider_id);
  if (pit == config_.providers.end()) {
    gateway_error(response, 404, "gateway_provider_not_found", "Provider does not exist.");
    return;
  }

  const auto& provider = pit->second;
  if (!model_allowed(provider, gateway_model)) {
    gateway_error(response, 403, "gateway_model_forbidden", "Model is not allowed.");
    return;
  }

  body["model"] = route->upstream_model_id;
  forwarded_body = body.dump();
  auto headers = filtered_request_headers(request.headers);

  if (provider.authentication == Authentication::bearer) {
    std::optional<Secret> secret;
    try {
      secret = resolver_.resolve_provider(provider.key_vendor, provider.key_slot);
    } catch (...) {
      gateway_error(response, 503, "gateway_credential_error", "Credential Store is unavailable.");
      return;
    }
    if (!secret) {
      gateway_error(response, 503, "gateway_credential_error", "Provider credential is unavailable.");
      return;
    }
    headers.emplace("Authorization", "Bearer " + std::string(secret->view()));
  }

  auto parsed = parse_base_url(provider.base_url);
  auto upstream_path = join_path(parsed.base_path, request.path);
  auto state = std::make_shared<StreamState>();
  auto upstream_client = client_for(provider);

  // Background upstream streaming thread
  std::thread([state, client = std::move(upstream_client), method = request.method,
               path = std::move(upstream_path), headers = std::move(headers),
               payload = std::move(forwarded_body)]() mutable {
    try {
      httplib::Request out;
      out.method = method;
      out.path = path;
      out.headers = std::move(headers);
      out.body = std::move(payload);

      out.response_handler = [state](const httplib::Response& r) {
        std::lock_guard lock(state->mutex);
        state->status = r.status;
        state->headers = filtered_response_headers(r.headers);
        state->headers_ready = true;
        state->cv.notify_all();
        return true;
      };

      out.content_receiver = [state](const char* data, std::size_t len, uint64_t, uint64_t) {
        std::unique_lock lock(state->mutex);
        state->cv.wait(lock, [&] { return state->chunks.size() < 16 || state->cancelled; });
        if (state->cancelled) {
          return false;
        }
        state->chunks.emplace_back(data, len);
        lock.unlock();
        state->cv.notify_all();
        return true;
      };

      auto result = client->send(out);
      {
        std::lock_guard lock(state->mutex);
        if (!result) {
          state->error = result.error();
          state->headers_ready = true;
        }
        state->done = true;
      }
      state->cv.notify_all();
    } catch (...) {
      std::lock_guard lock(state->mutex);
      state->headers_ready = true;
      state->done = true;
      state->cv.notify_all();
    }
  }).detach();

  // Wait until upstream response headers are received
  {
    std::unique_lock lock(state->mutex);
    state->cv.wait(lock, [&] { return state->headers_ready || state->done; });
    if (state->status == 502 && state->done && state->chunks.empty()) {
      lock.unlock();
      gateway_error(response, state->error == httplib::Error::Read ? 504 : 502,
                    "gateway_upstream_error", "Upstream request failed.");
      return;
    }
    response.status = state->status;
    for (const auto& [k, v] : state->headers) {
      response.headers.emplace(k, v);
    }
  }

  auto ct = response.get_header_value("Content-Type");
  if (ct.empty()) {
    ct = "application/octet-stream";
  }

  // Chunked response provider for streaming SSE / response chunks
  response.set_chunked_content_provider(
      ct,
      [state](std::size_t, httplib::DataSink& sink) {
        std::unique_lock lock(state->mutex);
        state->cv.wait(lock, [&] { return !state->chunks.empty() || state->done; });
        if (!state->chunks.empty()) {
          auto chunk = std::move(state->chunks.front());
          state->chunks.pop_front();
          lock.unlock();
          state->cv.notify_all();
          auto ok = sink.write(chunk.data(), chunk.size());
          if (!ok) {
            std::lock_guard cancel_lock(state->mutex);
            state->cancelled = true;
            state->cv.notify_all();
          }
          return ok;
        }
        lock.unlock();
        sink.done();
        return false;
      },
      [state](bool) {
        std::lock_guard lock(state->mutex);
        state->cancelled = true;
        state->cv.notify_all();
      });

  std::ostringstream log;
  log << "provider=" << provider.id << " model=" << gateway_model
      << " endpoint=" << request.path << " method=" << request.method
      << " status=" << response.status << " setup_latency_ms="
      << std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::steady_clock::now() - started)
             .count();
  logger_.log(LogLevel::info, log.str());
}

void Proxy::handle_models(const httplib::Request& request, httplib::Response& response) {
  if (!authenticate(request, response)) {
    return;
  }

  nlohmann::json result = {{"object", "list"}, {"data", nlohmann::json::array()}};
  std::size_t attempted = 0;
  std::size_t succeeded = 0;

  for (const auto& [id, p] : config_.providers) {
    if (!p.model_discovery) {
      continue;
    }
    ++attempted;
    std::vector<nlohmann::json> entries;
    bool cached = false;

    {
      std::lock_guard lock(cache_mutex_);
      auto it = model_cache_.find(id);
      if (config_.model_cache.enabled && it != model_cache_.end() &&
          std::chrono::steady_clock::now() - it->second.updated_at <
              std::chrono::seconds(config_.model_cache.ttl_sec)) {
        entries = it->second.models;
        cached = true;
      }
    }

    if (!cached) {
      try {
        auto client = client_for(p);
        httplib::Headers h;
        if (p.authentication == Authentication::bearer) {
          auto s = resolver_.resolve_provider(p.key_vendor, p.key_slot);
          if (!s) {
            continue;
          }
          h.emplace("Authorization", "Bearer " + std::string(s->view()));
        }
        auto parsed = parse_base_url(p.base_url);
        auto r = client->Get(join_path(parsed.base_path, "/models"), h);
        if (!r || r->status < 200 || r->status >= 300) {
          r = client->Get(join_path(parsed.base_path, "/v1/models"), h);
        }
        if (!r || r->status < 200 || r->status >= 300) {
          continue;
        }
        auto j = nlohmann::json::parse(r->body);
        entries = j.at("data").get<std::vector<nlohmann::json>>();

        if (config_.model_cache.enabled) {
          std::lock_guard lock(cache_mutex_);
          model_cache_[id] = {entries, std::chrono::steady_clock::now()};
        }
      } catch (...) {
        continue;
      }
    }

    ++succeeded;
    for (auto item : entries) {
      if (item.contains("id") && item["id"].is_string()) {
        auto gid = id + "/" + item["id"].get<std::string>();
        if (model_allowed(p, gid)) {
          item["id"] = gid;
          result["data"].push_back(std::move(item));
        }
      }
    }
  }

  if (attempted > 0 && succeeded == 0) {
    gateway_error(response, 502, "gateway_model_discovery_error",
                  "All provider model discovery requests failed.");
    return;
  }
  response.set_content(result.dump(), "application/json");
}

} // namespace gateway
