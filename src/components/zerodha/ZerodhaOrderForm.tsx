/**
 * Zerodha Order Form Component
 * Provides order placement interface with validation
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ShoppingCart, 
  TrendingUp, 
  TrendingDown,
  Calculator,
  AlertTriangle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

// Order validation schema
const orderSchema = z.object({
  exchange: z.enum(['NSE', 'BSE'], { required_error: 'Please select an exchange' }),
  tradingsymbol: z.string().min(1, 'Trading symbol is required'),
  transaction_type: z.enum(['BUY', 'SELL'], { required_error: 'Please select transaction type' }),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  product: z.enum(['CNC', 'MIS', 'NRML'], { required_error: 'Please select product type' }),
  order_type: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M'], { required_error: 'Please select order type' }),
  price: z.number().optional(),
  trigger_price: z.number().optional(),
  validity: z.enum(['DAY', 'IOC']).default('DAY'),
  disclosed_quantity: z.number().optional(),
}).refine((data) => {
  // Price is required for LIMIT and SL orders
  if (['LIMIT', 'SL'].includes(data.order_type) && !data.price) {
    return false;
  }
  // Trigger price is required for SL and SL-M orders
  if (['SL', 'SL-M'].includes(data.order_type) && !data.trigger_price) {
    return false;
  }
  return true;
}, {
  message: 'Price and trigger price are required for certain order types',
});

type OrderFormData = z.infer<typeof orderSchema>;

export interface ZerodhaOrderRequest {
  exchange: 'NSE' | 'BSE';
  tradingsymbol: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  product: 'CNC' | 'MIS' | 'NRML';
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price?: number;
  trigger_price?: number;
  validity?: 'DAY' | 'IOC';
  disclosed_quantity?: number;
}

interface ZerodhaOrderFormProps {
  symbol?: string;
  exchange?: 'NSE' | 'BSE';
  defaultTransactionType?: 'BUY' | 'SELL';
  currentPrice?: number;
  className?: string;
  onOrderPlaced?: (orderId: string) => void;
  onOrderError?: (error: string) => void;
}

export function ZerodhaOrderForm({
  symbol = '',
  exchange = 'NSE',
  defaultTransactionType = 'BUY',
  currentPrice,
  className = '',
  onOrderPlaced,
  onOrderError,
}: ZerodhaOrderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderEstimate, setOrderEstimate] = useState<{
    total: number;
    brokerage: number;
    taxes: number;
  } | null>(null);
  const [marginRequired, setMarginRequired] = useState<number | null>(null);

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      exchange,
      tradingsymbol: symbol,
      transaction_type: defaultTransactionType,
      quantity: 1,
      product: 'CNC',
      order_type: 'MARKET',
      validity: 'DAY',
      price: currentPrice,
    },
  });

  const watchedValues = form.watch();

  // Calculate order estimate
  useEffect(() => {
    const calculateEstimate = () => {
      const { quantity, price, order_type, transaction_type } = watchedValues;
      
      if (!quantity || (!price && order_type !== 'MARKET')) return;
      
      const orderPrice = order_type === 'MARKET' ? (currentPrice || 0) : (price || 0);
      const orderValue = quantity * orderPrice;
      
      // Simple brokerage calculation (₹20 or 0.03% whichever is lower for equity delivery)
      const brokerage = watchedValues.product === 'CNC' 
        ? Math.min(20, orderValue * 0.0003)
        : Math.min(20, orderValue * 0.0003);
      
      // Simplified tax calculation
      const stt = transaction_type === 'SELL' ? orderValue * 0.001 : 0;
      const transactionCharges = orderValue * 0.00003;
      const gst = (brokerage + transactionCharges) * 0.18;
      const sebiCharges = orderValue * 0.000001;
      const stampDuty = transaction_type === 'BUY' ? orderValue * 0.00003 : 0;
      
      const totalTaxes = stt + transactionCharges + gst + sebiCharges + stampDuty;
      const total = transaction_type === 'BUY' 
        ? orderValue + brokerage + totalTaxes
        : orderValue - brokerage - totalTaxes;

      setOrderEstimate({
        total,
        brokerage,
        taxes: totalTaxes,
      });

      // Margin calculation (simplified)
      if (transaction_type === 'BUY') {
        const margin = watchedValues.product === 'MIS' 
          ? orderValue * 0.2 // 20% margin for intraday
          : orderValue; // Full amount for delivery
        setMarginRequired(margin);
      } else {
        setMarginRequired(null);
      }
    };

    calculateEstimate();
  }, [watchedValues, currentPrice]);

  const onSubmit = async (data: OrderFormData) => {
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/zerodha/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('tradeflow_token')}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to place order');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const orderId = result.data.order_id;
        toast.success(`Order placed successfully! Order ID: ${orderId}`);
        
        // Reset form
        form.reset();
        
        // Callback
        onOrderPlaced?.(orderId);
      } else {
        throw new Error(result.error?.message || 'Order placement failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Order placement failed';
      toast.error(errorMessage);
      onOrderError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const requiresPrice = ['LIMIT', 'SL'].includes(watchedValues.order_type);
  const requiresTriggerPrice = ['SL', 'SL-M'].includes(watchedValues.order_type);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <ShoppingCart className="h-5 w-5" />
          <span>Place Order</span>
          {watchedValues.transaction_type === 'BUY' ? (
            <Badge className="bg-green-100 text-green-800 border-green-200">
              <TrendingUp className="mr-1 h-3 w-3" />
              BUY
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800 border-red-200">
              <TrendingDown className="mr-1 h-3 w-3" />
              SELL
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Symbol and Exchange */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tradingsymbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., RELIANCE"
                        {...field}
                        className="uppercase"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="exchange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Exchange</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select exchange" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NSE">NSE</SelectItem>
                        <SelectItem value="BSE">BSE</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Transaction Type and Product */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="transaction_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Transaction Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BUY">BUY</SelectItem>
                        <SelectItem value="SELL">SELL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="product"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="CNC">CNC (Delivery)</SelectItem>
                        <SelectItem value="MIS">MIS (Intraday)</SelectItem>
                        <SelectItem value="NRML">NRML (Normal)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Order Type and Validity */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="order_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MARKET">MARKET</SelectItem>
                        <SelectItem value="LIMIT">LIMIT</SelectItem>
                        <SelectItem value="SL">SL (Stop Loss)</SelectItem>
                        <SelectItem value="SL-M">SL-M (Stop Loss Market)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validity</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="DAY">DAY</SelectItem>
                        <SelectItem value="IOC">IOC (Immediate or Cancel)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Quantity */}
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price Fields */}
            {requiresPrice && (
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {requiresTriggerPrice && (
              <FormField
                control={form.control}
                name="trigger_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trigger Price (₹)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Order Estimate */}
            {orderEstimate && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Calculator className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Order Estimate</span>
                  </div>
                  
                  <div className="bg-muted/50 p-3 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Order Value:</span>
                      <span className="font-medium">
                        ₹{((watchedValues.quantity || 0) * (watchedValues.order_type === 'MARKET' ? (currentPrice || 0) : (watchedValues.price || 0))).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Brokerage:</span>
                      <span>₹{orderEstimate.brokerage.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxes & Charges:</span>
                      <span>₹{orderEstimate.taxes.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span className={watchedValues.transaction_type === 'BUY' ? 'text-red-600' : 'text-green-600'}>
                        ₹{orderEstimate.total.toFixed(2)}
                      </span>
                    </div>
                    
                    {marginRequired && (
                      <div className="flex justify-between text-blue-600">
                        <span>Margin Required:</span>
                        <span className="font-medium">₹{marginRequired.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Warnings */}
            {watchedValues.product === 'MIS' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  MIS orders will be auto-squared off before market close if not manually closed.
                </AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
              variant={watchedValues.transaction_type === 'BUY' ? 'default' : 'destructive'}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Placing Order...
                </>
              ) : (
                <>
                  {watchedValues.transaction_type === 'BUY' ? (
                    <TrendingUp className="mr-2 h-4 w-4" />
                  ) : (
                    <TrendingDown className="mr-2 h-4 w-4" />
                  )}
                  Place {watchedValues.transaction_type} Order
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default ZerodhaOrderForm;