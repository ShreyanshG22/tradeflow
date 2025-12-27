cmake_minimum_required(VERSION 3.16)
project(market-data-parser)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Compiler flags for performance
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG -flto")
set(CMAKE_CXX_FLAGS_DEBUG "-O0 -g -fsanitize=address -fsanitize=undefined")

# Find required packages
find_package(Threads REQUIRED)

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../shared/include)

# Source files
set(SOURCES
    src/main.cpp
    src/fix_parser.cpp
    src/feed_handler.cpp
    src/data_normalizer.cpp
    src/binary_format.cpp
    src/tick_storage.cpp
    ../shared/src/logger.cpp
    ../shared/src/high_res_timer.cpp
    ../shared/src/lock_free_queue.cpp
    ../shared/src/memory_pool.cpp
    ../shared/src/config.cpp
)

# Create executable
add_executable(market-data-parser ${SOURCES})

# Link libraries
target_link_libraries(market-data-parser 
    Threads::Threads
    atomic
)

# Compiler-specific optimizations
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    target_compile_options(market-data-parser PRIVATE
        -Wall -Wextra -Wpedantic
        -ffast-math
        -funroll-loops
        -finline-functions
        -fomit-frame-pointer
    )
endif()

# Enable CPU-specific optimizations
include(CheckCXXCompilerFlag)
check_cxx_compiler_flag("-mavx2" COMPILER_SUPPORTS_AVX2)
if(COMPILER_SUPPORTS_AVX2)
    target_compile_options(market-data-parser PRIVATE -mavx2)
endif()

check_cxx_compiler_flag("-msse4.2" COMPILER_SUPPORTS_SSE42)
if(COMPILER_SUPPORTS_SSE42)
    target_compile_options(market-data-parser PRIVATE -msse4.2)
endif()

# Install target
install(TARGETS market-data-parser DESTINATION bin)