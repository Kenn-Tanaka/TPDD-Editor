#include "gateway/gateway.hpp"
#include <algorithm>
#include <cctype>
#include <sstream>

namespace gateway {

namespace {

bool iequals(std::string_view a, std::string_view b) {
  if (a.size() != b.size()) {
    return false;
  }
  for (std::size_t i = 0; i < a.size(); ++i) {
    if (std::tolower(static_cast<unsigned char>(a[i])) !=
        std::tolower(static_cast<unsigned char>(b[i]))) {
      return false;
    }
  }
  return true;
}

std::string join(const std::vector<std::string>& values) {
  std::ostringstream out;
  for (std::size_t i = 0; i < values.size(); ++i) {
    if (i) {
      out << ", ";
    }
    out << values[i];
  }
  return out.str();
}

bool contains_ci(const std::vector<std::string>& values, std::string_view value) {
  return std::any_of(values.begin(), values.end(), [&](const auto& item) {
    return iequals(item, value);
  });
}

bool requested_headers_allowed(std::string_view requested,
                               const std::vector<std::string>& allowed) {
  std::size_t start = 0;
  while (start < requested.size()) {
    auto end = requested.find(',', start);
    if (end == std::string_view::npos) {
      end = requested.size();
    }
    auto token = requested.substr(start, end - start);
    while (!token.empty() && std::isspace(static_cast<unsigned char>(token.front()))) {
      token.remove_prefix(1);
    }
    while (!token.empty() && std::isspace(static_cast<unsigned char>(token.back()))) {
      token.remove_suffix(1);
    }
    if (token.empty() || !contains_ci(allowed, token)) {
      return false;
    }
    start = end + 1;
  }
  return true;
}

} // namespace

Gateway::Gateway(Config c, std::unique_ptr<ICredentialStore> credentials,
                 std::unique_ptr<Logger> logger)
    : config_(std::move(c)),
      credentials_(std::move(credentials)),
      logger_(std::move(logger)),
      proxy_(config_, *credentials_, *logger_) {
  server_.set_payload_max_length(config_.proxy.max_request_body_mb * 1024ULL * 1024ULL);

  // Pre-routing: CORS preflight (OPTIONS)
  server_.set_pre_routing_handler([this](const auto& req, auto& res) {
    if (!config_.cors.enabled || req.method != "OPTIONS") {
      return httplib::Server::HandlerResponse::Unhandled;
    }
    auto origin = req.get_header_value("Origin");
    auto requested_method = req.get_header_value("Access-Control-Request-Method");
    auto requested_headers = req.get_header_value("Access-Control-Request-Headers");

    if (origin.empty() || requested_method.empty()) {
      return httplib::Server::HandlerResponse::Unhandled;
    }

    if (!cors_origin_allowed(origin) ||
        !contains_ci(config_.cors.allowed_methods, requested_method) ||
        (!requested_headers.empty() &&
         !requested_headers_allowed(requested_headers, config_.cors.allowed_headers))) {
      res.status = 403;
      res.set_content(
          make_error("gateway_cors_forbidden", "CORS preflight request is not allowed."),
          "application/json");
      return httplib::Server::HandlerResponse::Handled;
    }

    res.status = 204;
    add_cors_headers(req, res);
    return httplib::Server::HandlerResponse::Handled;
  });

  // Post-routing: Add CORS headers to all normal responses
  server_.set_post_routing_handler([this](const auto& req, auto& res) {
    add_cors_headers(req, res);
  });

  // Models discovery endpoint
  server_.Get("/v1/models", [this](const auto& req, auto& res) {
    proxy_.handle_models(req, res);
  });

  // Proxy forwarding endpoints
  auto handler = [this](const auto& req, auto& res) {
    proxy_.handle(req, res);
  };
  server_.Get(R"(/v1/.*)", handler);
  server_.Post(R"(/v1/.*)", handler);
  server_.Delete(R"(/v1/.*)", handler);
  server_.Put(R"(/v1/.*)", handler);
  server_.Patch(R"(/v1/.*)", handler);

  // Error handler
  server_.set_error_handler([this](const auto& req, auto& res) {
    if (res.status == 413) {
      res.set_content(
          make_error("gateway_payload_too_large", "Request body exceeds configured limit."),
          "application/json");
    }
    add_cors_headers(req, res);
  });
}

bool Gateway::cors_origin_allowed(std::string_view origin) const {
  return std::find(config_.cors.allowed_origins.begin(),
                   config_.cors.allowed_origins.end(),
                   origin) != config_.cors.allowed_origins.end();
}

void Gateway::add_cors_headers(const httplib::Request& req, httplib::Response& res) const {
  if (!config_.cors.enabled) {
    return;
  }
  // Guard: prevent duplicate header write
  if (res.has_header("Access-Control-Allow-Origin")) {
    return;
  }
  auto origin = req.get_header_value("Origin");
  if (origin.empty() || !cors_origin_allowed(origin)) {
    return;
  }
  res.set_header("Access-Control-Allow-Origin", origin);
  res.set_header("Vary", "Origin");
  res.set_header("Access-Control-Allow-Methods", join(config_.cors.allowed_methods));
  res.set_header("Access-Control-Allow-Headers", join(config_.cors.allowed_headers));
  res.set_header("Access-Control-Max-Age", std::to_string(config_.cors.max_age_sec));
}

bool Gateway::listen() {
  return server_.listen(config_.listen.address, config_.listen.port);
}

void Gateway::stop() {
  server_.stop();
  logger_->flush();
}

} // namespace gateway
