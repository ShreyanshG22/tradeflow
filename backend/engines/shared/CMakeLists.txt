add_library(tradeflow-shared STATIC
    src/logger.cpp
    src/config.cpp
    src/memory_pool.cpp
    src/high_res_timer.cpp
    src/lock_free_queue.cpp
)

target_include_directories(tradeflow-shared PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(tradeflow-shared
    Threads::Threads
    ${HIREDIS_LIB}
    PostgreSQL::PostgreSQL
)