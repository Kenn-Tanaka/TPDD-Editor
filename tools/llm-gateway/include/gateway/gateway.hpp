#pragma once
#include "gateway/config.hpp"
#include "gateway/credential_store.hpp"
#include "gateway/logger.hpp"
#include "gateway/proxy.hpp"
#include <httplib.h>
#include <memory>
namespace gateway {
class Gateway {
public:
  Gateway(Config config, std::unique_ptr<ICredentialStore> credentials, std::unique_ptr<Logger> logger);
  bool listen(); void stop();
private:
  bool cors_origin_allowed(std::string_view origin) const;
  void add_cors_headers(const httplib::Request& request, httplib::Response& response) const;
  Config config_; std::unique_ptr<ICredentialStore> credentials_; std::unique_ptr<Logger> logger_;
  Proxy proxy_; httplib::Server server_;
};
}
