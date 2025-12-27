add_executable(backtest-engine
    src/main.cpp
    src/backtest_runner.cpp
    src/performance_calculator.cpp
    src/data_loader.cpp
    src/simd_indicators.cpp
    src/parallel_processor.cpp
    src/simulation_engine.cpp
    src/result_storage.cpp
)

target_include_directories(backtest-engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ../shared/include
)

target_link_libraries(backtest-engine
    tradeflow-shared
    Threads::Threads
    PostgreSQL::PostgreSQL
)

# SIMD optimizations and C++17 features
set_target_properties(backtest-engine PROPERTIES
    CXX_STANDARD 17
    CXX_STANDARD_REQUIRED ON
)

# Platform-specific SIMD optimizations
if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    target_compile_options(backtest-engine PRIVATE -mavx2 -mfma -march=native -mtune=native -O3)
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
    target_compile_options(backtest-engine PRIVATE -mcpu=native -O3)
else()
    target_compile_options(backtest-engine PRIVATE -O3)
endif()