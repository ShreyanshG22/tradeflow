cmake_minimum_required(VERSION 3.20)
project(TradeFlowEngines VERSION 1.0.0 LANGUAGES CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O3 -march=native -mtune=native")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -flto")
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -O3 -march=native -mtune=native")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -DDEBUG")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -flto")
endif()

# Find required packages
find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)

# Redis C++ client
find_path(HIREDIS_HEADER hiredis)
find_library(HIREDIS_LIB hiredis)

# PostgreSQL
find_package(PostgreSQL REQUIRED)

# Google Test for unit testing
find_package(GTest QUIET)
if(NOT GTest_FOUND)
    # Download and build Google Test if not found
    include(FetchContent)
    FetchContent_Declare(
        googletest
        URL https://github.com/google/googletest/archive/03597a01ee50f33f9142fd2db563d69b413611e5.zip
    )
    FetchContent_MakeAvailable(googletest)
endif()

# Enable testing
enable_testing()

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/shared/include)

# Engine executables
add_subdirectory(shared)
add_subdirectory(trading-engine)
add_subdirectory(backtest-engine)
add_subdirectory(risk-manager)
add_subdirectory(market-data-parser)

# Test executables (only in Debug mode or when explicitly requested)
if(CMAKE_BUILD_TYPE STREQUAL "Debug" OR BUILD_TESTS)
    add_subdirectory(tests)
endif()

# Install targets
install(TARGETS trading-engine backtest-engine risk-manager market-data-parser
        RUNTIME DESTINATION bin)

# Custom targets for development
add_custom_target(clean-all
    COMMAND ${CMAKE_BUILD_TOOL} clean
    COMMAND ${CMAKE_COMMAND} -E remove_directory ${CMAKE_BINARY_DIR}
)

# Performance optimization flags for release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    set_target_properties(trading-engine PROPERTIES
        COMPILE_FLAGS "-ffast-math -funroll-loops -finline-functions"
    )
endif()