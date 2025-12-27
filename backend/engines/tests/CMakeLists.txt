# Test executables for TradeFlow engines
cmake_minimum_required(VERSION 3.20)

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../shared/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../trading-engine/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../backtest-engine/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../risk-manager/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../market-data-parser/include)

# Test for shared components
add_executable(test_shared
    test_shared.cpp
    test_logger.cpp
    test_high_res_timer.cpp
    test_heartbeat_monitor.cpp
)

target_link_libraries(test_shared
    shared_lib
    gtest_main
    gtest
    pthread
)

# Test for trading engine
add_executable(test_trading_engine
    test_trading_engine.cpp
    test_lock_free_order_book.cpp
    test_order_management_system.cpp
    test_latency_tracker.cpp
    test_performance_monitor.cpp
)

target_link_libraries(test_trading_engine
    shared_lib
    gtest_main
    gtest
    pthread
)

# Test for backtest engine
add_executable(test_backtest_engine
    test_backtest_engine.cpp
    test_data_loader.cpp
    test_simulation_engine.cpp
    test_performance_calculator.cpp
    test_simd_indicators.cpp
)

target_link_libraries(test_backtest_engine
    shared_lib
    gtest_main
    gtest
    pthread
)

# Test for risk manager
add_executable(test_risk_manager
    test_risk_manager.cpp
    test_pre_trade_validator.cpp
    test_portfolio_monitor.cpp
    test_dynamic_risk_enforcer.cpp
)

target_link_libraries(test_risk_manager
    shared_lib
    gtest_main
    gtest
    pthread
)

# Test for market data parser
add_executable(test_market_data_parser
    test_market_data_parser.cpp
    test_fix_parser.cpp
    test_binary_format.cpp
    test_tick_storage.cpp
)

target_link_libraries(test_market_data_parser
    shared_lib
    gtest_main
    gtest
    pthread
)

# Benchmark executables
add_executable(benchmark_latency
    benchmark_latency.cpp
)

target_link_libraries(benchmark_latency
    shared_lib
    gtest_main
    gtest
    pthread
)

add_executable(benchmark_throughput
    benchmark_throughput.cpp
)

target_link_libraries(benchmark_throughput
    shared_lib
    gtest_main
    gtest
    pthread
)

add_executable(benchmark_memory
    benchmark_memory.cpp
)

target_link_libraries(benchmark_memory
    shared_lib
    gtest_main
    gtest
    pthread
)

# Load and Stress Test executables
add_executable(hft_load_test
    hft_load_test.cpp
)

target_link_libraries(hft_load_test
    shared_lib
    gtest_main
    gtest
    pthread
)

add_executable(market_data_stress_test
    market_data_stress_test.cpp
)

target_link_libraries(market_data_stress_test
    shared_lib
    gtest_main
    gtest
    pthread
)

add_executable(memory_leak_test
    memory_leak_test.cpp
)

target_link_libraries(memory_leak_test
    shared_lib
    gtest_main
    gtest
    pthread
)

# Simple validation test
add_executable(simple_validation_test
    simple_validation_test.cpp
)

target_link_libraries(simple_validation_test
    shared_lib
    gtest_main
    gtest
    pthread
)

# Register tests with CTest
add_test(NAME SharedComponentsTest COMMAND test_shared)
add_test(NAME TradingEngineTest COMMAND test_trading_engine)
add_test(NAME BacktestEngineTest COMMAND test_backtest_engine)
add_test(NAME RiskManagerTest COMMAND test_risk_manager)
add_test(NAME MarketDataParserTest COMMAND test_market_data_parser)
add_test(NAME SimpleValidationTest COMMAND simple_validation_test)

# Set test properties
set_tests_properties(SharedComponentsTest PROPERTIES TIMEOUT 30)
set_tests_properties(TradingEngineTest PROPERTIES TIMEOUT 60)
set_tests_properties(BacktestEngineTest PROPERTIES TIMEOUT 120)
set_tests_properties(RiskManagerTest PROPERTIES TIMEOUT 60)
set_tests_properties(MarketDataParserTest PROPERTIES TIMEOUT 30)
set_tests_properties(SimpleValidationTest PROPERTIES TIMEOUT 10)

# Coverage target (optional)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    find_program(GCOV_PATH gcov)
    find_program(LCOV_PATH lcov)
    find_program(GENHTML_PATH genhtml)
    
    if(GCOV_PATH AND LCOV_PATH AND GENHTML_PATH)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} --coverage")
        set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} --coverage")
        
        add_custom_target(coverage
            COMMAND ${LCOV_PATH} --directory . --capture --output-file coverage.info
            COMMAND ${LCOV_PATH} --remove coverage.info '/usr/*' --output-file coverage.info
            COMMAND ${LCOV_PATH} --list coverage.info
            COMMAND ${GENHTML_PATH} -o coverage coverage.info
            WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
        )
    endif()
endif()