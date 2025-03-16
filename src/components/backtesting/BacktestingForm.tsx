
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Search, Clock, Wallet, Shield, Gauge, Bug, Sliders, Info } from "lucide-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  symbol: z.string().min(1, "Stock symbol is required"),
  timeframe: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  initialCapital: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Initial capital must be a positive number",
  }),
  positionSize: z.string(),
  positionSizeValue: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Value must be a positive number",
  }),
  slippage: z.number().min(0).max(5),
  brokerage: z.string(),
  stopLossType: z.string(),
  stopLossValue: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Value must be a positive number",
  }),
  takeProfitType: z.string(),
  takeProfitValue: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Value must be a positive number",
  }),
  maxConsecutiveLosses: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: "Value must be a non-negative number",
  }),
  detailedLogging: z.boolean(),
});

interface BacktestingFormProps {
  onRunBacktest?: () => void;
  isRunning?: boolean;
  fastMode?: boolean;
  onSetFastMode?: (value: boolean) => void;
}

export function BacktestingForm({ onRunBacktest, isRunning, fastMode, onSetFastMode }: BacktestingFormProps) {
  const [searchResults, setSearchResults] = useState([
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
    { symbol: "NIFTY", name: "Nifty 50 Index" },
    { symbol: "BANKNIFTY", name: "Bank Nifty Index" },
  ]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: "",
      timeframe: "day",
      startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
      endDate: new Date(),
      initialCapital: "100000",
      positionSize: "percent",
      positionSizeValue: "5",
      slippage: 0.05,
      brokerage: "zerodha",
      stopLossType: "percent",
      stopLossValue: "2",
      takeProfitType: "percent",
      takeProfitValue: "4",
      maxConsecutiveLosses: "5",
      detailedLogging: false,
    },
  });

  const formValues = form.watch();

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
    if (onRunBacktest) onRunBacktest();
  }

  const handleQuickDateSelect = (months: number) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    form.setValue("startDate", startDate);
    form.setValue("endDate", endDate);
  };

  const toggleFastMode = () => {
    if (onSetFastMode) onSetFastMode(!fastMode);
  };

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Accordion type="single" collapsible defaultValue="instrument" className="w-full">
              <AccordionItem value="instrument">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Search className="h-4 w-4 mr-2" />
                  Instrument Selection
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="symbol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Symbol</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              placeholder="Enter stock symbol" 
                              {...field} 
                              disabled={isRunning}
                            />
                            {field.value && searchResults.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 border rounded-md bg-background shadow-md">
                                {searchResults.map((result) => (
                                  <div 
                                    key={result.symbol}
                                    className="px-4 py-2 hover:bg-muted cursor-pointer"
                                    onClick={() => form.setValue("symbol", result.symbol)}
                                  >
                                    <div className="font-medium">{result.symbol}</div>
                                    <div className="text-xs text-muted-foreground">{result.name}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="flex items-center gap-1">
                      NIFTY <Button variant="ghost" size="icon" className="h-4 w-4 p-0">×</Button>
                    </Badge>
                    <Badge variant="outline" className="flex items-center gap-1">
                      RELIANCE <Button variant="ghost" size="icon" className="h-4 w-4 p-0">×</Button>
                    </Badge>
                    <Button variant="outline" size="sm" className="text-xs h-6 px-2">
                      + Add Multiple
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="timeframe">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  Timeframe Selection
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="timeframe"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timeframe</FormLabel>
                        <div className="grid grid-cols-4 gap-2">
                          {["1min", "5min", "15min", "30min", "60min", "day", "week"].map((tf) => (
                            <Button
                              key={tf}
                              type="button"
                              variant={field.value === tf ? "default" : "outline"}
                              size="sm"
                              className="h-8"
                              onClick={() => form.setValue("timeframe", tf)}
                              disabled={isRunning}
                            >
                              {tf === "day" ? "Daily" : tf === "week" ? "Weekly" : tf}
                            </Button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Start Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={isRunning}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date > new Date() || date > form.getValues("endDate")}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>End Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={isRunning}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) => date > new Date() || date < form.getValues("startDate")}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" 
                      onClick={() => handleQuickDateSelect(1)}
                      disabled={isRunning}
                    >
                      Last 1 Month
                    </Button>
                    <Button type="button" variant="outline" size="sm" 
                      onClick={() => handleQuickDateSelect(6)}
                      disabled={isRunning}
                    >
                      Last 6 Months
                    </Button>
                    <Button type="button" variant="outline" size="sm" 
                      onClick={() => handleQuickDateSelect(60)}
                      disabled={isRunning}
                    >
                      Last 5 Years
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="capital">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Wallet className="h-4 w-4 mr-2" />
                  Capital & Position Sizing
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="initialCapital"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial Capital</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                            <Input
                              {...field}
                              type="text"
                              inputMode="numeric"
                              className="pl-8"
                              disabled={isRunning}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="positionSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position Sizing Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isRunning}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select position sizing method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed Lot Size</SelectItem>
                            <SelectItem value="percent">Percentage of Capital</SelectItem>
                            <SelectItem value="risk">Risk-based Sizing</SelectItem>
                            <SelectItem value="custom">Custom Formula</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="positionSizeValue"
                    render={({ field }) => {
                      const positionSizeType = form.watch("positionSize");
                      let label = "Value";
                      let prefix = "";
                      
                      switch (positionSizeType) {
                        case "fixed":
                          label = "Lots Per Trade";
                          prefix = "";
                          break;
                        case "percent":
                          label = "Percentage of Capital";
                          prefix = "%";
                          break;
                        case "risk":
                          label = "Risk per Trade";
                          prefix = "%";
                          break;
                        case "custom":
                          label = "Custom Formula";
                          prefix = "";
                          break;
                      }
                      
                      return (
                        <FormItem>
                          <div className="flex justify-between">
                            <FormLabel>{label}</FormLabel>
                            {positionSizeType === "custom" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-4 w-4">
                                      <Info className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="max-w-xs">
                                      You can use variables like {"{capital}"}, {"{atr}"}, {"{close}"} in your formula.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <FormControl>
                            <div className="relative">
                              {prefix && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">{prefix}</span>
                              )}
                              <Input
                                {...field}
                                type="text"
                                inputMode="numeric"
                                className={prefix ? "pl-8" : ""}
                                disabled={isRunning}
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            {positionSizeType === "risk" && "Percentage of capital at risk per trade"}
                            {positionSizeType === "custom" && "Use mathematical expressions with trading variables"}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="slippage">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Sliders className="h-4 w-4 mr-2" />
                  Slippage & Fees
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="slippage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slippage (%)</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            <Slider
                              min={0}
                              max={1}
                              step={0.01}
                              defaultValue={[field.value]}
                              onValueChange={(values) => field.onChange(values[0])}
                              disabled={isRunning}
                            />
                            <div className="flex justify-between">
                              <p className="text-xs">{field.value.toFixed(2)}%</p>
                              <Input
                                type="number"
                                value={field.value}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-xs"
                                min={0}
                                max={1}
                                step={0.01}
                                disabled={isRunning}
                              />
                            </div>
                          </div>
                        </FormControl>
                        <FormDescription>
                          Simulates realistic price execution with slippage
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="brokerage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brokerage Plan</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isRunning}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select brokerage structure" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="zerodha">Zerodha (₹20 per executed order)</SelectItem>
                            <SelectItem value="fyers">Fyers (₹20 per executed order)</SelectItem>
                            <SelectItem value="angel">Angel One (0.05% per trade)</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {form.watch("brokerage") === "custom" && (
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <FormLabel className="text-xs">Fixed per trade</FormLabel>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">₹</span>
                                <Input type="text" inputMode="numeric" className="pl-8 h-8 text-xs" defaultValue="20" disabled={isRunning} />
                              </div>
                            </div>
                            <div>
                              <FormLabel className="text-xs">Percentage</FormLabel>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">%</span>
                                <Input type="text" inputMode="numeric" className="pl-8 h-8 text-xs" defaultValue="0.03" disabled={isRunning} />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <FormLabel className="text-xs">Additional fees</FormLabel>
                            <div className="text-xs space-y-1">
                              <div className="flex items-center">
                                <Checkbox id="stt" disabled={isRunning} defaultChecked />
                                <label htmlFor="stt" className="ml-2">Securities Transaction Tax (0.025%)</label>
                              </div>
                              <div className="flex items-center">
                                <Checkbox id="stamp" disabled={isRunning} defaultChecked />
                                <label htmlFor="stamp" className="ml-2">Stamp Duty (0.003%)</label>
                              </div>
                              <div className="flex items-center">
                                <Checkbox id="gst" disabled={isRunning} defaultChecked />
                                <label htmlFor="gst" className="ml-2">GST (18% on brokerage)</label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="risk">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Risk Management
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="stopLossType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stop Loss Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isRunning}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select stop loss type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="percent">Percentage</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                              <SelectItem value="atr">ATR Multiple</SelectItem>
                              <SelectItem value="none">No Stop Loss</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch("stopLossType") !== "none" && (
                      <FormField
                        control={form.control}
                        name="stopLossValue"
                        render={({ field }) => {
                          const stopLossType = form.watch("stopLossType");
                          let prefix = "";
                          switch (stopLossType) {
                            case "percent":
                              prefix = "%";
                              break;
                            case "fixed":
                              prefix = "₹";
                              break;
                            case "atr":
                              prefix = "×";
                              break;
                          }
                          
                          return (
                            <FormItem>
                              <FormLabel>Stop Loss Value</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  {prefix && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">{prefix}</span>
                                  )}
                                  <Input
                                    {...field}
                                    type="text"
                                    inputMode="numeric"
                                    className={prefix ? "pl-8" : ""}
                                    disabled={isRunning}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="takeProfitType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Take Profit Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isRunning}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select take profit type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="percent">Percentage</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                              <SelectItem value="atr">ATR Multiple</SelectItem>
                              <SelectItem value="none">No Take Profit</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch("takeProfitType") !== "none" && (
                      <FormField
                        control={form.control}
                        name="takeProfitValue"
                        render={({ field }) => {
                          const takeProfitType = form.watch("takeProfitType");
                          let prefix = "";
                          switch (takeProfitType) {
                            case "percent":
                              prefix = "%";
                              break;
                            case "fixed":
                              prefix = "₹";
                              break;
                            case "atr":
                              prefix = "×";
                              break;
                          }
                          
                          return (
                            <FormItem>
                              <FormLabel>Take Profit Value</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  {prefix && (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">{prefix}</span>
                                  )}
                                  <Input
                                    {...field}
                                    type="text"
                                    inputMode="numeric"
                                    className={prefix ? "pl-8" : ""}
                                    disabled={isRunning}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="maxConsecutiveLosses"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Consecutive Losses</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            inputMode="numeric"
                            disabled={isRunning}
                          />
                        </FormControl>
                        <FormDescription>
                          Stop backtest after this many consecutive losses (0 = no limit)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="execution">
                <AccordionTrigger className="text-sm font-medium flex items-center">
                  <Gauge className="h-4 w-4 mr-2" />
                  Execution Settings
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel>Fast Mode</FormLabel>
                      <FormDescription>
                        Run backtest at maximum speed
                      </FormDescription>
                    </div>
                    <Switch 
                      checked={fastMode} 
                      onCheckedChange={toggleFastMode}
                      disabled={isRunning}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="detailedLogging"
                    render={({ field }) => (
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <FormLabel>Detailed Debug Mode</FormLabel>
                          <FormDescription>
                            Log every indicator calculation and trade decision
                          </FormDescription>
                        </div>
                        <Switch 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          disabled={isRunning}
                        />
                      </div>
                    )}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isRunning || !form.formState.isValid}
            >
              Run Backtest
            </Button>
          </form>
        </Form>
      </div>
    </ScrollArea>
  );
}

// The Checkbox component is just used once in a minor feature, so we'll define it here
const Checkbox = ({ id, ...props }: React.ComponentProps<"input"> & { id: string }) => {
  return (
    <input
      type="checkbox"
      id={id}
      className="h-3 w-3 rounded border-gray-300 text-primary focus:ring-primary"
      {...props}
    />
  );
};
