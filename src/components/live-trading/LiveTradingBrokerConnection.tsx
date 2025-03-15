
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Key, Link as LinkIcon, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

export function LiveTradingBrokerConnection() {
  const [broker, setBroker] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [apiSecret, setApiSecret] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { toast } = useToast();

  const handleConnect = () => {
    if (!broker || !apiKey || !apiSecret) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields before connecting.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    // Simulate API connection
    setTimeout(() => {
      setIsConnected(true);
      setIsLoading(false);
      toast({
        title: "Connection successful",
        description: `Connected to ${broker} successfully.`,
      });
    }, 1500);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    toast({
      title: "Disconnected",
      description: `Disconnected from ${broker}.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Broker Connection</CardTitle>
        <CardDescription>
          Connect to your trading broker to enable live trading
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <Select value={broker} onValueChange={setBroker} disabled={isConnected}>
              <SelectTrigger>
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="zerodha">Zerodha</SelectItem>
                <SelectItem value="fyers">Fyers</SelectItem>
                <SelectItem value="dhan">Dhan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Input
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={isConnected}
              type="password"
              className="flex h-10"
            />
          </div>
          <div className="sm:col-span-1">
            <Input
              placeholder="API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              disabled={isConnected}
              type="password"
              className="flex h-10"
            />
          </div>
          <div className="flex items-center sm:col-span-1">
            {!isConnected ? (
              <Button onClick={handleConnect} disabled={isLoading} className="w-full">
                {isLoading ? (
                  "Connecting..."
                ) : (
                  <>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Connect
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleDisconnect} variant="outline" className="w-full">
                <LinkIcon className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            )}
          </div>
        </div>
        {isConnected && (
          <Alert className="mt-4 border-green-200 bg-green-50 text-green-800">
            <Check className="h-4 w-4" />
            <AlertDescription>
              Successfully connected to {broker}. You can now start trading.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
