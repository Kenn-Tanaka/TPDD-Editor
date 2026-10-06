#include "gateway/credential_store.hpp"
#include <stdexcept>
namespace gateway {
namespace {class UnavailableStore final:public ICredentialStore{public:std::optional<Secret>get(std::string_view,std::string_view)override{throw std::runtime_error("Secret Service unavailable: build with libsecret-1 development files");}};}
std::unique_ptr<ICredentialStore> make_platform_credential_store(){return std::make_unique<UnavailableStore>();}
}
