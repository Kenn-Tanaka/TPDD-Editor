#include "manager/validation.hpp"
#include <algorithm>
#include <cctype>
namespace manager {
bool valid_service_name(std::string_view v,std::string& reason){if(v.empty()){reason="Service name is required.";return false;}if(v.size()>128){reason="Service name must be 128 bytes or fewer.";return false;}if(std::any_of(v.begin(),v.end(),[](unsigned char c){return c<0x20||c==0x7f;})){reason="Service name contains a control character.";return false;}return true;}
bool valid_username(std::string_view v,std::string& reason){if(v.empty()){reason="Credential identifier is required.";return false;}if(v.size()>128){reason="Credential identifier must be 128 bytes or fewer.";return false;}if(std::any_of(v.begin(),v.end(),[](unsigned char c){return c<0x20||c==0x7f;})){reason="Credential identifier contains a control character.";return false;}return true;}
}
