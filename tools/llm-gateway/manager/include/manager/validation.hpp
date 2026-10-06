#pragma once
#include <string>
#include <string_view>
namespace manager {
bool valid_service_name(std::string_view value,std::string& reason);
bool valid_username(std::string_view value,std::string& reason);
}
