
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Search, Clock, Wallet } from "lucide-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
});

export function BacktestingForm() {
  const [searchResults, setSearchResults] = useState([
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
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
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <ScrollArea className="h-full p-4">
      <div className="space-y-6">
        <h3 className="font-medium">Backtest Parameters</h3>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center">
                <Search className="h-4 w-4 mr-2" />
                Stock/Index Selection
              </h4>
              
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
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center">
                <Clock className="h-4 w-4 mr-2" />
                Timeframe Selection
              </h4>
              
              <FormField
                control={form.control}
                name="timeframe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timeframe</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1min">1 Minute</SelectItem>
                        <SelectItem value="5min">5 Minutes</SelectItem>
                        <SelectItem value="15min">15 Minutes</SelectItem>
                        <SelectItem value="30min">30 Minutes</SelectItem>
                        <SelectItem value="60min">1 Hour</SelectItem>
                        <SelectItem value="day">Daily</SelectItem>
                        <SelectItem value="week">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
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
                            disabled={(date) => date > new Date()}
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
                            disabled={(date) => date > new Date()}
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
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center">
                <Wallet className="h-4 w-4 mr-2" />
                Capital & Position Sizing
              </h4>
              
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select position sizing method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed Value</SelectItem>
                        <SelectItem value="percent">Percentage of Capital</SelectItem>
                        <SelectItem value="risk">Risk-based Sizing</SelectItem>
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
                      label = "Fixed Amount";
                      prefix = "₹";
                      break;
                    case "percent":
                      label = "Percentage of Capital";
                      prefix = "%";
                      break;
                    case "risk":
                      label = "Risk per Trade";
                      prefix = "%";
                      break;
                  }
                  
                  return (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
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
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        {positionSizeType === "risk" && "Percentage of capital at risk per trade"}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
          </form>
        </Form>
      </div>
    </ScrollArea>
  );
}
