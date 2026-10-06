#pragma once
#include "gateway/provider.hpp"
#include <string_view>
namespace gateway {
bool glob_match(std::string_view pattern, std::string_view value) noexcept;
bool model_allowed(const ProviderConfig& provider, std::string_view gateway_model_id) noexcept;
}
