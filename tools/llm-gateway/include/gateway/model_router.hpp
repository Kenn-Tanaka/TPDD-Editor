#pragma once
#include <optional>
#include <string>
#include <string_view>
namespace gateway {
struct ModelRoute { std::string provider_id; std::string upstream_model_id; };
std::optional<ModelRoute> route_model(std::string_view gateway_model_id);
}
