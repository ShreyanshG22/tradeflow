add_executable(risk-manager
    src/main.cpp
    src/risk_calculator.cpp
    src/position_monitor.cpp
    src/limit_enforcer.cpp
    src/dynamic_risk_enforcer.cpp
    src/risk_reporter.cpp
)

target_include_directories(risk-manager PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(risk-manager
    tradeflow-shared
    Threads::Threads
    ${HIREDIS_LIB}
)

# Real-time optimizations but allow exceptions for error handling
set_target_properties(risk-manager PROPERTIES
    COMPILE_FLAGS "-march=native -mtune=native -O3"
)

# Test executable
add_executable(test-risk-manager
    src/test_risk_manager.cpp
    src/risk_calculator.cpp
    src/position_monitor.cpp
)

target_include_directories(test-risk-manager PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(test-risk-manager
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-risk-manager PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Dynamic risk enforcer test executable
add_executable(test-dynamic-risk-enforcer
    src/test_dynamic_risk_enforcer.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(test-dynamic-risk-enforcer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(test-dynamic-risk-enforcer
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-dynamic-risk-enforcer PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Simple dynamic risk enforcer test
add_executable(simple-dynamic-test
    src/simple_dynamic_test.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(simple-dynamic-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(simple-dynamic-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(simple-dynamic-test PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Dynamic risk enforcer integration test
add_executable(test-dynamic-integration
    src/test_dynamic_integration.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(test-dynamic-integration PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(test-dynamic-integration
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-dynamic-integration PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Minimal dynamic risk enforcer test
add_executable(minimal-risk-test
    src/minimal_test.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(minimal-risk-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(minimal-risk-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(minimal-risk-test PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Risk reporter test executable
add_executable(test-risk-reporter
    src/test_risk_reporter.cpp
    src/risk_reporter.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(test-risk-reporter PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(test-risk-reporter
    tradeflow-shared
    Threads::Threads
)

set_target_properties(test-risk-reporter PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Simple risk reporter test executable
add_executable(simple-risk-reporter-test
    src/simple_risk_reporter_test.cpp
    src/risk_reporter.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(simple-risk-reporter-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(simple-risk-reporter-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(simple-risk-reporter-test PROPERTIES
    COMPILE_FLAGS "-O2"
)

# Minimal risk reporter test executable
add_executable(minimal-risk-reporter-test
    src/minimal_risk_reporter_test.cpp
    src/risk_reporter.cpp
    src/dynamic_risk_enforcer.cpp
    src/position_monitor.cpp
    src/risk_calculator.cpp
)

target_include_directories(minimal-risk-reporter-test PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/shared/include
)

target_link_libraries(minimal-risk-reporter-test
    tradeflow-shared
    Threads::Threads
)

set_target_properties(minimal-risk-reporter-test PROPERTIES
    COMPILE_FLAGS "-O2"
)