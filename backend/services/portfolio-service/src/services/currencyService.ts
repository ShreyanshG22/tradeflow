import { redisService } from './redis';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { CurrencyRate } from '../types';

export class CurrencyService {
  private readonly baseCurrency = 'USD';
  private readonly supportedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'];

  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      // Same currency
      if (fromCurrency === toCurrency) {
        return 1.0;
      }

      // Check cache first
      const cached = await this.getCachedRate(fromCurrency, toCurrency);
      if (cached) {
        return cached.rate;
      }

      // Fetch from external API (mock implementation)
      const rate = await this.fetchExchangeRate(fromCurrency, toCurrency);
      
      // Cache the rate
      await this.cacheRate(fromCurrency, toCurrency, rate);
      
      return rate;
    } catch (error) {
      logger.error('Failed to get exchange rate', { fromCurrency, toCurrency, error });
      
      // Return 1.0 as fallback to prevent calculation errors
      return 1.0;
    }
  }

  async convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    return amount * rate;
  }

  async convertPortfolioValue(
    value: number, 
    fromCurrency: string, 
    toCurrency: string
  ): Promise<{ convertedValue: number; exchangeRate: number }> {
    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
    const convertedValue = value * exchangeRate;
    
    return {
      convertedValue,
      exchangeRate
    };
  }

  async getMultiCurrencyRates(baseCurrency: string): Promise<Record<string, number>> {
    try {
      const rates: Record<string, number> = {};
      
      for (const currency of this.supportedCurrencies) {
        if (currency !== baseCurrency) {
          rates[currency] = await this.getExchangeRate(baseCurrency, currency);
        } else {
          rates[currency] = 1.0;
        }
      }
      
      return rates;
    } catch (error) {
      logger.error('Failed to get multi-currency rates', { baseCurrency, error });
      throw error;
    }
  }

  isSupportedCurrency(currency: string): boolean {
    return this.supportedCurrencies.includes(currency.toUpperCase());
  }

  getSupportedCurrencies(): string[] {
    return [...this.supportedCurrencies];
  }

  private async fetchExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    try {
      // Mock implementation - in production, integrate with real forex API
      // Examples: Alpha Vantage, Fixer.io, ExchangeRate-API, etc.
      
      const mockRates: Record<string, Record<string, number>> = {
        'USD': {
          'EUR': 0.85,
          'GBP': 0.73,
          'JPY': 110.0,
          'CAD': 1.25,
          'AUD': 1.35,
          'CHF': 0.92,
          'CNY': 6.45
        },
        'EUR': {
          'USD': 1.18,
          'GBP': 0.86,
          'JPY': 129.4,
          'CAD': 1.47,
          'AUD': 1.59,
          'CHF': 1.08,
          'CNY': 7.59
        }
        // Add more currency pairs as needed
      };

      // Try direct rate
      if (mockRates[fromCurrency] && mockRates[fromCurrency][toCurrency]) {
        return mockRates[fromCurrency][toCurrency];
      }

      // Try inverse rate
      if (mockRates[toCurrency] && mockRates[toCurrency][fromCurrency]) {
        return 1 / mockRates[toCurrency][fromCurrency];
      }

      // Cross-currency calculation via USD
      if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
        const fromUsdRate = await this.getExchangeRate(fromCurrency, 'USD');
        const toUsdRate = await this.getExchangeRate('USD', toCurrency);
        return fromUsdRate * toUsdRate;
      }

      logger.warn('Exchange rate not found, using fallback', { fromCurrency, toCurrency });
      return 1.0;
      
    } catch (error) {
      logger.error('Failed to fetch exchange rate from API', { fromCurrency, toCurrency, error });
      return 1.0;
    }
  }

  private async getCachedRate(fromCurrency: string, toCurrency: string): Promise<CurrencyRate | null> {
    try {
      const key = `exchange_rate:${fromCurrency}:${toCurrency}`;
      const cached = await redisService.get(key);
      
      if (cached) {
        const rate: CurrencyRate = JSON.parse(cached);
        
        // Check if rate is still valid (not older than cache TTL)
        const ageInSeconds = (Date.now() - new Date(rate.timestamp).getTime()) / 1000;
        if (ageInSeconds < config.portfolio.currencyTtl) {
          return rate;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached exchange rate', { fromCurrency, toCurrency, error });
      return null;
    }
  }

  private async cacheRate(fromCurrency: string, toCurrency: string, rate: number): Promise<void> {
    try {
      const key = `exchange_rate:${fromCurrency}:${toCurrency}`;
      const currencyRate: CurrencyRate = {
        fromCurrency,
        toCurrency,
        rate,
        timestamp: new Date()
      };
      
      await redisService.set(
        key, 
        JSON.stringify(currencyRate), 
        config.portfolio.currencyTtl
      );
      
      // Also cache the inverse rate
      const inverseKey = `exchange_rate:${toCurrency}:${fromCurrency}`;
      const inverseCurrencyRate: CurrencyRate = {
        fromCurrency: toCurrency,
        toCurrency: fromCurrency,
        rate: 1 / rate,
        timestamp: new Date()
      };
      
      await redisService.set(
        inverseKey, 
        JSON.stringify(inverseCurrencyRate), 
        config.portfolio.currencyTtl
      );
      
    } catch (error) {
      logger.error('Failed to cache exchange rate', { fromCurrency, toCurrency, rate, error });
    }
  }

  async refreshAllRates(): Promise<void> {
    try {
      logger.info('Refreshing all exchange rates');
      
      for (const fromCurrency of this.supportedCurrencies) {
        for (const toCurrency of this.supportedCurrencies) {
          if (fromCurrency !== toCurrency) {
            await this.getExchangeRate(fromCurrency, toCurrency);
          }
        }
      }
      
      logger.info('All exchange rates refreshed');
    } catch (error) {
      logger.error('Failed to refresh all exchange rates', error);
    }
  }
}

export const currencyService = new CurrencyService();