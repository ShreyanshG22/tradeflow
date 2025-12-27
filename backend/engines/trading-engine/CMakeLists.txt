add_executable(trading-engine
    src/main.cpp
    src/order_book.cpp
    src/lock_free_order_book.cpp
    src/trading_allocator.cpp
    src/latency_tracker.cpp
    src/order_management_system.cpp
    src/strategy_execution_engine.cpp
    src/performance_monitor.cpp
    src/execution_engine.cpp
    src/strategy_executor.cpp
    src/latency_monitor.cpp
)

target_include_directories(trading-engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/engines/shared/include
)

target_link_libraries(trading-engine
    tradeflow-shared
    Threads::Threads
    ${HIREDIS_LIB}
)

# Ultra-low latency optimizations
set_target_properties(trading-engine PROPERTIES
    COMPILE_FLAGS "-fno-exceptions -fno-rtti -march=native -mtune=native -O3 -DNDEBUG"
)

# Test executable for core infrastructure
add_executable(test-core-infrastructure
    src/test_core_infrastructure.cpp
    src/lock_free_order_book.cpp
    src/trading_allocator.cpp
    src/latency_tracker.cpp
)

target_include_directories(test-core-infrastructure PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/engines/shared/include
)

target_link_libraries(test-core-infrastructure
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-core-infrastructure PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O2"
)

# Simple test executable
add_executable(simple-test
    src/simple_test.cpp
    src/trading_allocator.cpp
    src/latency_tracker.cpp
)

target_include_directories(simple-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/engines/shared/include
)

target_link_libraries(simple-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(simple-test PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O2"
)

# Minimal test executable
add_executable(minimal-test
    src/minimal_test.cpp
)

set_target_properties(minimal-test PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O2"
)

# Order Management System test
add_executable(test-order-management
    src/test_order_management.cpp
    src/order_management_system.cpp
    src/lock_free_order_book.cpp
    src/trading_allocator.cpp
    src/latency_tracker.cpp
)

target_include_directories(test-order-management PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/engines/shared/include
)

target_link_libraries(test-order-management
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-order-management PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O2"
)

# Simple OMS test
add_executable(simple-oms-test
    src/simple_oms_test.cpp
    src/order_management_system.cpp
    src/lock_free_order_book.cpp
    src/trading_allocator.cpp
    src/latency_tracker.cpp
)

target_include_directories(simple-oms-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/engines/shared/include
)

target_link_libraries(simple-oms-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(simple-oms-test PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O2"
)