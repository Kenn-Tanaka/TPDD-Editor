#include "gateway/credential_store.hpp"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <stdexcept>
#include <unordered_map>

namespace gateway {
namespace {
std::string trim(std::string_view input){auto first=input.find_first_not_of(" \t\r\n");if(first==std::string_view::npos)return{};auto last=input.find_last_not_of(" \t\r\n");return std::string(input.substr(first,last-first+1));}
}
std::string normalize_vendor(std::string_view input){auto value=trim(input);for(auto& c:value)if(static_cast<unsigned char>(c)<128)c=static_cast<char>(std::tolower(static_cast<unsigned char>(c)));if(value=="google")value="gemini";if(value.empty())throw std::invalid_argument("key_vendor must not be empty");return value;}
std::string normalize_slot(std::string_view input){auto value=trim(input);if(value.empty())value="default";if(!std::all_of(value.begin(),value.end(),[](unsigned char c){return std::isalnum(c)||c=='_'||c=='-';}))throw std::invalid_argument("key_slot contains invalid characters");return value;}
CredentialResolver::CredentialResolver(ICredentialStore& store,std::string service_name,bool environment_fallback):store_(store),service_name_(std::move(service_name)),environment_fallback_(environment_fallback){}
std::optional<Secret> CredentialResolver::resolve_named(std::string_view name){return store_.get(service_name_,name);}
std::optional<Secret> CredentialResolver::resolve_provider(std::string_view vendor,std::string_view slot){auto normalized_vendor=normalize_vendor(vendor);auto username=normalized_vendor+"|"+normalize_slot(slot);auto value=store_.get(service_name_,username);if(value||!environment_fallback_)return value;static const std::unordered_map<std::string,const char*> vars{{"gemini","GEMINI_API_KEY"},{"openai","OPENAI_API_KEY"},{"openrouter","OPENROUTER_API_KEY"},{"anthropic","ANTHROPIC_API_KEY"}};auto it=vars.find(normalized_vendor);if(it==vars.end())return std::nullopt;auto* env=std::getenv(it->second);if(!env||!*env)return std::nullopt;return Secret(env);}
}
