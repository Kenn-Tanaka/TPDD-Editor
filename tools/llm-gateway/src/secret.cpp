#include "gateway/secret.hpp"
#include <algorithm>
namespace gateway {
Secret::Secret(std::string value) : value_(std::move(value)) {}
Secret::Secret(Secret&& other) noexcept : value_(std::move(other.value_)) { other.clear(); }
Secret& Secret::operator=(Secret&& other) noexcept { if (this != &other) { clear(); value_ = std::move(other.value_); other.clear(); } return *this; }
Secret::~Secret() { clear(); }
void Secret::clear() noexcept { volatile char* p = value_.empty() ? nullptr : value_.data(); for (std::size_t i=0; i<value_.size(); ++i) p[i]=0; value_.clear(); }
}
