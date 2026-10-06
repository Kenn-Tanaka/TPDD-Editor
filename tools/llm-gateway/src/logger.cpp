#include "gateway/logger.hpp"
#include <chrono>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
namespace gateway {
LogLevel parse_log_level(std::string_view s){if(s=="error")return LogLevel::error;if(s=="warn")return LogLevel::warn;if(s=="info")return LogLevel::info;if(s=="debug")return LogLevel::debug;throw std::runtime_error("invalid log level");}
Logger::Logger(std::string path,LogLevel level):file_(std::move(path),std::ios::app),level_(level){if(!file_)throw std::runtime_error("cannot open log file");}
void Logger::log(LogLevel level,std::string_view msg){if(static_cast<int>(level)>static_cast<int>(level_))return;auto now=std::chrono::system_clock::now();auto t=std::chrono::system_clock::to_time_t(now);std::tm tm{};
#ifdef _WIN32
gmtime_s(&tm,&t);
#else
gmtime_r(&t,&tm);
#endif
std::lock_guard lock(mutex_);file_<<std::put_time(&tm,"%FT%TZ")<<' '<<msg<<'\n';}
void Logger::flush(){std::lock_guard lock(mutex_);file_.flush();}
}
