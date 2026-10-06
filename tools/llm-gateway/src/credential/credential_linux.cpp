#include "gateway/credential_store.hpp"
#include <libsecret/secret.h>
#include <stdexcept>

namespace gateway {
namespace {

const SecretSchema schema = {
  "org.freedesktop.Secret.Generic",
  SECRET_SCHEMA_NONE,
  {
    {"service", SECRET_SCHEMA_ATTRIBUTE_STRING},
    {"username", SECRET_SCHEMA_ATTRIBUTE_STRING},
    {nullptr, SECRET_SCHEMA_ATTRIBUTE_STRING}
  }
};

class LinuxCredentialStore final : public ICredentialStore {
public:
  std::optional<Secret> get(std::string_view service, std::string_view username) override {
    GError* error = nullptr;
    auto s = std::string(service);
    auto u = std::string(username);
    gchar* value = secret_password_lookup_sync(
      &schema,
      nullptr,
      &error,
      "service", s.c_str(),
      "username", u.c_str(),
      nullptr
    );
    if (error) {
      auto message = std::string(error->message);
      g_error_free(error);
      throw std::runtime_error("Secret Service lookup failed: " + message);
    }
    if (!value) {
      return std::nullopt;
    }
    Secret out(value);
    secret_password_free(value);
    return out;
  }
};

} // namespace

std::unique_ptr<ICredentialStore> make_platform_credential_store() {
  return std::make_unique<LinuxCredentialStore>();
}

} // namespace gateway
