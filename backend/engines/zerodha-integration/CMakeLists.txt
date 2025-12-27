# Zerodha KiteConnect Integration
cmake_minimum_required(VERSION 3.16)
project(ZerodhaIntegration)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(PkgConfig REQUIRED)
find_package(Threads REQUIRED)

# Find libcurl
find_package(CURL REQUIRED)

# Find OpenSSL
find_package(OpenSSL REQUIRED)

# Find nlohmann/json
find_package(nlohmann_json REQUIRED)

# Include directories
include_directories(include)
include_directories(../shared/include)

# Source files
set(SOURCES
    src/kite_connect.cpp
    src/market_data_client.cpp
    src/order_client.cpp
    src/websocket_client.cpp
    src/nse_bse_adapter.cpp
)

# Create library
add_library(zerodha_integration STATIC ${SOURCES})

# Link libraries
target_link_libraries(zerodha_integration
    PRIVATE
    ${CURL_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    Threads::Threads
)

# Compiler flags for optimization
target_compile_options(zerodha_integration PRIVATE
    -O3
    -march=native
    -mtune=native
    -flto
    -ffast-math
)

# Install
install(TARGETS zerodha_integration
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(DIRECTORY include/
    DESTINATION include
    FILES_MATCHING PATTERN "*.hpp"
)