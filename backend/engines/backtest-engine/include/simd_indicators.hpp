#pragma once

#include <vector>
#include <cstdint>

#ifdef __ARM_NEON
#include <arm_neon.h>
#elif defined(__AVX2__)
#include <immintrin.h>
#endif

namespace tradeflow {

class SIMDIndicators {
public:
    SIMDIndicators() = default;
    
    // Simple Moving Average using SIMD
    static void calculateSMA(const float* prices, float* sma, 
                            size_t length, size_t period);
    
    // Exponential Moving Average using SIMD
    static void calculateEMA(const float* prices, float* ema, 
                            size_t length, float alpha);
    
    // Relative Strength Index using vectorized operations
    static void calculateRSI(const float* prices, float* rsi, 
                            size_t length, size_t period);
    
    // MACD calculation with vectorized operations
    static void calculateMACD(const float* prices, float* macd_line, 
                             float* signal_line, float* histogram,
                             size_t length, size_t fast_period, 
                             size_t slow_period, size_t signal_period);
    
    // Bollinger Bands using SIMD
    static void calculateBollingerBands(const float* prices, 
                                       float* upper_band, 
                                       float* middle_band, 
                                       float* lower_band,
                                       size_t length, size_t period, 
                                       float std_dev_multiplier);
    
    // Standard deviation calculation using SIMD
    static void calculateStdDev(const float* values, float* std_dev,
                               size_t length, size_t period);
    
    // Vectorized price change calculations
    static void calculateReturns(const float* prices, float* returns, 
                                size_t length);
    
    // High-performance correlation calculation
    static float calculateCorrelation(const float* x, const float* y, 
                                     size_t length);
    
    // Vectorized min/max operations
    static void findMinMax(const float* values, size_t length, 
                          float& min_val, float& max_val);
    
    // Rolling window operations using SIMD
    static void rollingSum(const float* values, float* sums, 
                          size_t length, size_t window);
    
private:
    // Helper functions for SIMD operations
#ifdef __ARM_NEON
    static float horizontal_sum_neon(float32x4_t v);
#elif defined(__AVX2__)
    static __m256 horizontal_sum_avx(__m256 v);
#endif
    
    static void vectorized_multiply_add(const float* a, const float* b, 
                                       float* result, size_t length);
    static void vectorized_subtract(const float* a, const float* b, 
                                   float* result, size_t length);
};

} // namespace tradeflow