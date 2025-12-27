#include "simd_indicators.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>

#ifdef __ARM_NEON
#include <arm_neon.h>
#endif

namespace tradeflow {

void SIMDIndicators::calculateSMA(const float* prices, float* sma, 
                                 size_t length, size_t period) {
    if (length < period) return;
    
    // Calculate initial sum for first SMA value
    float sum = 0.0f;
    for (size_t i = 0; i < period; ++i) {
        sum += prices[i];
    }
    sma[period - 1] = sum / period;
    
    // Rolling window calculations
    for (size_t i = period; i < length; ++i) {
        sum = sum - prices[i - period] + prices[i];
        sma[i] = sum / period;
    }
    
#ifdef __ARM_NEON
    // ARM NEON optimization for large datasets
    const size_t simd_width = 4; // NEON processes 4 floats at once
    
    if (length > period + simd_width) {
        size_t vectorized_end = length - (length % simd_width);
        
        for (size_t i = period; i < vectorized_end; i += simd_width) {
            float32x4_t current_prices = vld1q_f32(&prices[i]);
            float32x4_t old_prices = vld1q_f32(&prices[i - period]);
            float32x4_t previous_sums = vld1q_f32(&sma[i - 1]);
            
            // Rolling sum update: new_sum = old_sum - old_price + new_price
            float32x4_t price_diff = vsubq_f32(current_prices, old_prices);
            float32x4_t new_sums = vaddq_f32(previous_sums, price_diff);
            float32x4_t period_vec = vdupq_n_f32(static_cast<float>(period));
            float32x4_t new_sma = vdivq_f32(new_sums, period_vec);
            
            vst1q_f32(&sma[i], new_sma);
        }
    }
#elif defined(__AVX2__)
    // AVX2 optimization for x86_64
    const size_t simd_width = 8;
    
    if (length > period + simd_width) {
        size_t vectorized_end = length - (length % simd_width);
        
        for (size_t i = period; i < vectorized_end; i += simd_width) {
            __m256 current_prices = _mm256_loadu_ps(&prices[i]);
            __m256 old_prices = _mm256_loadu_ps(&prices[i - period]);
            __m256 previous_sums = _mm256_loadu_ps(&sma[i - 1]);
            
            __m256 price_diff = _mm256_sub_ps(current_prices, old_prices);
            __m256 new_sums = _mm256_add_ps(previous_sums, price_diff);
            __m256 period_vec = _mm256_set1_ps(static_cast<float>(period));
            __m256 new_sma = _mm256_div_ps(new_sums, period_vec);
            
            _mm256_storeu_ps(&sma[i], new_sma);
        }
    }
#endif
}

void SIMDIndicators::calculateEMA(const float* prices, float* ema, 
                                 size_t length, float alpha) {
    if (length == 0) return;
    
    ema[0] = prices[0];
    
#ifdef __ARM_NEON
    const float32x4_t alpha_vec = vdupq_n_f32(alpha);
    const float32x4_t one_minus_alpha = vdupq_n_f32(1.0f - alpha);
    const size_t simd_width = 4;
    
    // Process in chunks of 4 for NEON optimization
    size_t i = 1;
    for (; i + simd_width <= length; i += simd_width) {
        float32x4_t current_prices = vld1q_f32(&prices[i]);
        float32x4_t previous_ema = vld1q_f32(&ema[i - 1]);
        
        // EMA = alpha * price + (1 - alpha) * previous_ema
        float32x4_t alpha_price = vmulq_f32(alpha_vec, current_prices);
        float32x4_t weighted_prev = vmulq_f32(one_minus_alpha, previous_ema);
        float32x4_t new_ema = vaddq_f32(alpha_price, weighted_prev);
        
        vst1q_f32(&ema[i], new_ema);
    }
    
    // Handle remaining elements
    for (; i < length; ++i) {
        ema[i] = alpha * prices[i] + (1.0f - alpha) * ema[i - 1];
    }
#elif defined(__AVX2__)
    const __m256 alpha_vec = _mm256_set1_ps(alpha);
    const __m256 one_minus_alpha = _mm256_set1_ps(1.0f - alpha);
    const size_t simd_width = 8;
    
    size_t i = 1;
    for (; i + simd_width <= length; i += simd_width) {
        __m256 current_prices = _mm256_loadu_ps(&prices[i]);
        __m256 previous_ema = _mm256_loadu_ps(&ema[i - 1]);
        
        __m256 alpha_price = _mm256_mul_ps(alpha_vec, current_prices);
        __m256 weighted_prev = _mm256_mul_ps(one_minus_alpha, previous_ema);
        __m256 new_ema = _mm256_add_ps(alpha_price, weighted_prev);
        
        _mm256_storeu_ps(&ema[i], new_ema);
    }
    
    for (; i < length; ++i) {
        ema[i] = alpha * prices[i] + (1.0f - alpha) * ema[i - 1];
    }
#else
    // Fallback implementation without SIMD
    for (size_t i = 1; i < length; ++i) {
        ema[i] = alpha * prices[i] + (1.0f - alpha) * ema[i - 1];
    }
#endif
}

void SIMDIndicators::calculateRSI(const float* prices, float* rsi, 
                                 size_t length, size_t period) {
    if (length <= period) return;
    
    std::vector<float> gains(length, 0.0f);
    std::vector<float> losses(length, 0.0f);
    
    // Calculate price changes and separate gains/losses
    calculateReturns(prices, gains.data(), length);
    
#ifdef __ARM_NEON
    const size_t simd_width = 4;
    for (size_t i = 1; i + simd_width <= length; i += simd_width) {
        float32x4_t changes = vld1q_f32(&gains[i]);
        float32x4_t zeros = vdupq_n_f32(0.0f);
        
        // Separate gains and losses
        uint32x4_t gain_mask = vcgtq_f32(changes, zeros);
        uint32x4_t loss_mask = vcltq_f32(changes, zeros);
        
        float32x4_t gains_vec = vbslq_f32(gain_mask, changes, zeros);
        float32x4_t losses_vec = vbslq_f32(loss_mask, vnegq_f32(changes), zeros);
        
        vst1q_f32(&gains[i], gains_vec);
        vst1q_f32(&losses[i], losses_vec);
    }
#elif defined(__AVX2__)
    const size_t simd_width = 8;
    for (size_t i = 1; i + simd_width <= length; i += simd_width) {
        __m256 changes = _mm256_loadu_ps(&gains[i]);
        __m256 zeros = _mm256_setzero_ps();
        
        __m256 gain_mask = _mm256_cmp_ps(changes, zeros, _CMP_GT_OQ);
        __m256 loss_mask = _mm256_cmp_ps(changes, zeros, _CMP_LT_OQ);
        
        __m256 gains_vec = _mm256_and_ps(gain_mask, changes);
        __m256 losses_vec = _mm256_and_ps(loss_mask, _mm256_sub_ps(zeros, changes));
        
        _mm256_storeu_ps(&gains[i], gains_vec);
        _mm256_storeu_ps(&losses[i], losses_vec);
    }
#else
    // Fallback implementation
    for (size_t i = 1; i < length; ++i) {
        float change = gains[i];
        if (change > 0) {
            gains[i] = change;
            losses[i] = 0.0f;
        } else {
            gains[i] = 0.0f;
            losses[i] = -change;
        }
    }
#endif
    
    // Calculate average gains and losses using SMA
    std::vector<float> avg_gains(length);
    std::vector<float> avg_losses(length);
    
    calculateSMA(gains.data(), avg_gains.data(), length, period);
    calculateSMA(losses.data(), avg_losses.data(), length, period);
    
    // Calculate RSI = 100 - (100 / (1 + RS)), where RS = avg_gain / avg_loss
    for (size_t i = period; i < length; ++i) {
        if (avg_losses[i] != 0.0f) {
            float rs = avg_gains[i] / avg_losses[i];
            rsi[i] = 100.0f - (100.0f / (1.0f + rs));
        } else {
            rsi[i] = 100.0f;
        }
    }
}

// Simplified implementations for other functions to avoid compilation issues
void SIMDIndicators::calculateMACD(const float* prices, float* macd_line, 
                                  float* signal_line, float* histogram,
                                  size_t length, size_t fast_period, 
                                  size_t slow_period, size_t signal_period) {
    std::vector<float> fast_ema(length);
    std::vector<float> slow_ema(length);
    
    float fast_alpha = 2.0f / (fast_period + 1);
    float slow_alpha = 2.0f / (slow_period + 1);
    float signal_alpha = 2.0f / (signal_period + 1);
    
    calculateEMA(prices, fast_ema.data(), length, fast_alpha);
    calculateEMA(prices, slow_ema.data(), length, slow_alpha);
    
    // Calculate MACD line (fast EMA - slow EMA)
    for (size_t i = 0; i < length; ++i) {
        macd_line[i] = fast_ema[i] - slow_ema[i];
    }
    
    calculateEMA(macd_line, signal_line, length, signal_alpha);
    
    // Calculate histogram (MACD - Signal)
    for (size_t i = 0; i < length; ++i) {
        histogram[i] = macd_line[i] - signal_line[i];
    }
}

void SIMDIndicators::calculateBollingerBands(const float* prices, 
                                           float* upper_band, 
                                           float* middle_band, 
                                           float* lower_band,
                                           size_t length, size_t period, 
                                           float std_dev_multiplier) {
    calculateSMA(prices, middle_band, length, period);
    
    std::vector<float> std_devs(length);
    calculateStdDev(prices, std_devs.data(), length, period);
    
    for (size_t i = period - 1; i < length; ++i) {
        float band_width = std_devs[i] * std_dev_multiplier;
        upper_band[i] = middle_band[i] + band_width;
        lower_band[i] = middle_band[i] - band_width;
    }
}

void SIMDIndicators::calculateStdDev(const float* values, float* std_dev,
                                    size_t length, size_t period) {
    if (length < period) return;
    
    std::vector<float> sma(length);
    calculateSMA(values, sma.data(), length, period);
    
    for (size_t i = period - 1; i < length; ++i) {
        float sum_sq_diff = 0.0f;
        
        for (size_t j = i - period + 1; j <= i; ++j) {
            float diff = values[j] - sma[i];
            sum_sq_diff += diff * diff;
        }
        
        std_dev[i] = std::sqrt(sum_sq_diff / period);
    }
}

void SIMDIndicators::calculateReturns(const float* prices, float* returns, 
                                     size_t length) {
    if (length <= 1) return;
    
    returns[0] = 0.0f;
    
    for (size_t i = 1; i < length; ++i) {
        returns[i] = (prices[i] - prices[i - 1]) / prices[i - 1];
    }
}

float SIMDIndicators::calculateCorrelation(const float* x, const float* y, 
                                          size_t length) {
    if (length < 2) return 0.0f;
    
    // Calculate means
    float sum_x = 0.0f, sum_y = 0.0f;
    for (size_t i = 0; i < length; ++i) {
        sum_x += x[i];
        sum_y += y[i];
    }
    
    float mean_x = sum_x / length;
    float mean_y = sum_y / length;
    
    // Calculate correlation components
    float numerator = 0.0f;
    float denom_x = 0.0f;
    float denom_y = 0.0f;
    
    for (size_t i = 0; i < length; ++i) {
        float x_diff = x[i] - mean_x;
        float y_diff = y[i] - mean_y;
        
        numerator += x_diff * y_diff;
        denom_x += x_diff * x_diff;
        denom_y += y_diff * y_diff;
    }
    
    float denominator = std::sqrt(denom_x * denom_y);
    return (denominator != 0.0f) ? numerator / denominator : 0.0f;
}

void SIMDIndicators::findMinMax(const float* values, size_t length, 
                               float& min_val, float& max_val) {
    if (length == 0) return;
    
    min_val = values[0];
    max_val = values[0];
    
    for (size_t i = 1; i < length; ++i) {
        min_val = std::min(min_val, values[i]);
        max_val = std::max(max_val, values[i]);
    }
}

void SIMDIndicators::rollingSum(const float* values, float* sums, 
                               size_t length, size_t window) {
    if (length < window) return;
    
    // Calculate first window sum
    float sum = 0.0f;
    for (size_t i = 0; i < window; ++i) {
        sum += values[i];
    }
    sums[window - 1] = sum;
    
    // Rolling window
    for (size_t i = window; i < length; ++i) {
        sum = sum - values[i - window] + values[i];
        sums[i] = sum;
    }
}

// Helper functions - simplified for ARM compatibility
#ifdef __ARM_NEON
float SIMDIndicators::horizontal_sum_neon(float32x4_t v) {
    float32x2_t sum = vadd_f32(vget_high_f32(v), vget_low_f32(v));
    sum = vpadd_f32(sum, sum);
    return vget_lane_f32(sum, 0);
}
#elif defined(__AVX2__)
__m256 SIMDIndicators::horizontal_sum_avx(__m256 v) {
    __m256 shuf = _mm256_movehdup_ps(v);
    __m256 sums = _mm256_add_ps(v, shuf);
    shuf = _mm256_movehl_ps(shuf, sums);
    sums = _mm256_add_ss(sums, shuf);
    return sums;
}
#endif

void SIMDIndicators::vectorized_multiply_add(const float* a, const float* b, 
                                           float* result, size_t length) {
    for (size_t i = 0; i < length; ++i) {
        result[i] += a[i] * b[i];
    }
}

void SIMDIndicators::vectorized_subtract(const float* a, const float* b, 
                                        float* result, size_t length) {
    for (size_t i = 0; i < length; ++i) {
        result[i] = a[i] - b[i];
    }
}

} // namespace tradeflow