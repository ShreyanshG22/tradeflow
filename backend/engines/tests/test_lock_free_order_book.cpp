#include <gtest/gtest.h>
#include "lock_free_order_book.hpp"
#include <thread>
#include <vector>
#include <atomic>

class LockFreeOrderBookTest : public ::testing::Test {
protected:
    void SetUp() override {
        order_book = std::make_unique<LockFreeOrderBook<double, 10000>>();
    }

    void TearDown() override {
        order_book.reset();
    }

    std::unique_ptr<LockFreeOrderBook<double, 10000>> order_book;
};

TEST_F(LockFreeOrderBookTest, BasicOrderInsertion) {
    // Create test orders
    Order buy_order{1, 100.50, 100, OrderStatus::PENDING};
    Order sell_order{2, 101.00, 50, OrderStatus::PENDING};
    
    // Add orders to the book
    EXPECT_TRUE(order_book->add_order(&buy_order));
    EXPECT_TRUE(order_book->add_order(&sell_order));
    
    // Check best bid and ask
    auto best_bid = order_book->get_best_bid();
    auto best_ask = order_book->get_best_ask();
    
    EXPECT_DOUBLE_EQ(best_bid.first, 100.50);
    EXPECT_EQ(best_bid.second, 100);
    
    EXPECT_DOUBLE_EQ(best_ask.first, 101.00);
    EXPECT_EQ(best_ask.second, 50);
}

TEST_F(LockFreeOrderBookTest, OrderCancellation) {
    Order order{1, 100.50, 100, OrderStatus::PENDING};
    
    EXPECT_TRUE(order_book->add_order(&order));
    
    // Verify order is in the book
    auto best_bid = order_book->get_best_bid();
    EXPECT_DOUBLE_EQ(best_bid.first, 100.50);
    
    // Cancel the order
    EXPECT_TRUE(order_book->cancel_order(1));
    
    // Verify order is no longer in the book
    best_bid = order_book->get_best_bid();
    EXPECT_DOUBLE_EQ(best_bid.first, 0.0); // No orders left
}

TEST_F(LockFreeOrderBookTest, PricePriorityOrdering) {
    // Add multiple buy orders at different prices
    Order buy1{1, 100.00, 100, OrderStatus::PENDING};
    Order buy2{2, 100.50, 100, OrderStatus::PENDING}; // Higher price, should be best bid
    Order buy3{3, 99.50, 100, OrderStatus::PENDING};
    
    order_book->add_order(&buy1);
    order_book->add_order(&buy2);
    order_book->add_order(&buy3);
    
    // Best bid should be the highest price
    auto best_bid = order_book->get_best_bid();
    EXPECT_DOUBLE_EQ(best_bid.first, 100.50);
    
    // Add multiple sell orders at different prices
    Order sell1{4, 101.00, 50, OrderStatus::PENDING}; // Lower price, should be best ask
    Order sell2{5, 101.50, 50, OrderStatus::PENDING};
    Order sell3{6, 100.75, 50, OrderStatus::PENDING};
    
    order_book->add_order(&sell1);
    order_book->add_order(&sell2);
    order_book->add_order(&sell3);
    
    // Best ask should be the lowest price
    auto best_ask = order_book->get_best_ask();
    EXPECT_DOUBLE_EQ(best_ask.first, 100.75);
}

TEST_F(LockFreeOrderBookTest, ConcurrentOperations) {
    const int num_threads = 4;
    const int orders_per_thread = 1000;
    std::atomic<int> successful_adds{0};
    std::atomic<int> successful_cancels{0};
    
    std::vector<std::thread> threads;
    
    // Launch threads that add orders concurrently
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back([&, t]() {
            for (int i = 0; i < orders_per_thread; ++i) {
                uint64_t order_id = t * orders_per_thread + i + 1;
                double price = 100.0 + (i % 100) * 0.01; // Vary prices
                uint32_t quantity = 100 + (i % 50);
                
                Order* order = new Order{order_id, price, quantity, OrderStatus::PENDING};
                
                if (order_book->add_order(order)) {
                    successful_adds.fetch_add(1);
                    
                    // Occasionally cancel orders
                    if (i % 10 == 0) {
                        if (order_book->cancel_order(order_id)) {
                            successful_cancels.fetch_add(1);
                        }
                    }
                }
            }
        });
    }
    
    // Wait for all threads to complete
    for (auto& thread : threads) {
        thread.join();
    }
    
    // Verify that operations completed successfully
    EXPECT_GT(successful_adds.load(), 0);
    std::cout << "Successful adds: " << successful_adds.load() << std::endl;
    std::cout << "Successful cancels: " << successful_cancels.load() << std::endl;
}

TEST_F(LockFreeOrderBookTest, PerformanceBenchmark) {
    const int num_orders = 100000;
    
    // Prepare orders
    std::vector<Order> orders;
    orders.reserve(num_orders);
    
    for (int i = 0; i < num_orders; ++i) {
        orders.emplace_back(Order{
            static_cast<uint64_t>(i + 1),
            100.0 + (i % 1000) * 0.01,
            100 + (i % 100),
            OrderStatus::PENDING
        });
    }
    
    // Benchmark order insertion
    auto start_time = std::chrono::high_resolution_clock::now();
    
    for (auto& order : orders) {
        order_book->add_order(&order);
    }
    
    auto end_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::nanoseconds>(end_time - start_time);
    
    double ns_per_operation = static_cast<double>(duration.count()) / num_orders;
    double operations_per_second = 1000000000.0 / ns_per_operation;
    
    std::cout << "Order book performance: " << ns_per_operation << " ns per add" << std::endl;
    std::cout << "Operations per second: " << operations_per_second << std::endl;
    
    // Should be able to handle at least 100,000 operations per second
    EXPECT_GT(operations_per_second, 100000.0);
}

TEST_F(LockFreeOrderBookTest, MemoryManagement) {
    const int num_orders = 1000;
    std::vector<Order*> orders;
    
    // Add many orders
    for (int i = 0; i < num_orders; ++i) {
        Order* order = new Order{
            static_cast<uint64_t>(i + 1),
            100.0 + i * 0.01,
            100,
            OrderStatus::PENDING
        };
        orders.push_back(order);
        EXPECT_TRUE(order_book->add_order(order));
    }
    
    // Cancel half of them
    for (int i = 0; i < num_orders / 2; ++i) {
        EXPECT_TRUE(order_book->cancel_order(i + 1));
    }
    
    // Verify remaining orders are still accessible
    auto best_bid = order_book->get_best_bid();
    auto best_ask = order_book->get_best_ask();
    
    EXPECT_GT(best_bid.first, 0.0);
    EXPECT_GT(best_ask.first, 0.0);
    
    // Clean up
    for (auto* order : orders) {
        delete order;
    }
}