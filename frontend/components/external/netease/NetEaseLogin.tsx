import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { neteaseApi } from '@/lib/api/netease';
import { NetEaseProfile } from '@/stores/netease-store';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';

export function NetEaseLogin({ onLoginSuccess }: { onLoginSuccess: (cookie: string, userId: string, profile: NetEaseProfile) => void }) {
  const [loading, setLoading] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  
  // QR Code State
  const [qrKey, setQrKey] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<number>(0); // 800: expired, 801: waiting, 802: scanning, 803: success
  const [qrMessage, setQrMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const checkStatus = async (key: string) => {
      if (!mounted) return;
      try {
        const res = await neteaseApi.checkQrStatus(key);
        if (!mounted) return;
        
        const code = res.data.code;
        setQrStatus(code);
        setQrMessage(res.data.message);

        if (code === 800) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setQrMessage('QR Code expired, click to refresh');
        } else if (code === 803) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          const cookie = res.cookie;
          if (cookie) {
            await handleLoginVerify(cookie);
          } else {
            toast.error('Login successful but no cookie received');
          }
        }
      } catch (e) {
        // ignore polling errors
      }
    };

    const initQrCode = async () => {
      try {
        const res = await neteaseApi.getQrKey();
        if (!mounted) return;
        
        if (res.data && res.data.unikey) {
          const key = res.data.unikey;
          setQrKey(key);
          setQrUrl(`https://music.163.com/login?codekey=${key}`);
          setQrStatus(801);
          setQrMessage('Open NetEase App to scan');
          
          intervalId = setInterval(() => checkStatus(key), 3000);
        }
      } catch (e) {
        console.error('Failed to init QR', e);
        setQrMessage('Failed to load QR code');
      }
    };

    initQrCode();

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshKey]);

  const handleRefreshQr = () => {
    setRefreshKey(k => k + 1);
  };

  const handleLoginVerify = async (cookie: string) => {
      setLoading(true);
      try {
          const profileRes = await neteaseApi.getMyInfo(cookie);
          if (profileRes.data.account && profileRes.data.profile) {
               toast.success('Login successful');
               const profile: NetEaseProfile = {
                   nickname: profileRes.data.profile.nickname,
                   avatarUrl: profileRes.data.profile.avatarUrl,
                   backgroundUrl: profileRes.data.profile.backgroundUrl,
                   signature: profileRes.data.profile.signature,
               };
               onLoginSuccess(cookie, profileRes.data.account.id, profile);
          } else {
               toast.error('Login verification failed. Please try again.');
               setQrStatus(800);
               setQrMessage('Verification failed. Click to refresh QR.');
          }
      } catch (e: any) {
          toast.error(e.message);
          setQrStatus(800);
          setQrMessage('Verification error. Click to refresh QR.');
      } finally {
          setLoading(false);
      }
  };

  const handleManualLogin = () => {
    if (!cookieInput) return;
    handleLoginVerify(cookieInput);
  };

  return (
    <div className="flex items-center justify-center h-full p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Login to NetEase Music</CardTitle>
          <CardDescription>Scan QR code with NetEase App or use cookie</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {/* Left: QR Code */}
             <div className="flex flex-col items-center justify-center space-y-4 border-r pr-8">
                <div className="text-sm font-medium text-muted-foreground mb-2">Scan with NetEase App</div>
                {qrUrl ? (
                    <div className="relative group">
                        <div className={`p-2 bg-white rounded-lg ${qrStatus === 800 ? 'opacity-20' : ''}`}>
                            <QRCodeSVG value={qrUrl} size={180} />
                        </div>
                        {qrStatus === 800 && (
                            <div 
                                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                                onClick={handleRefreshQr}
                            >
                                <RefreshCw className="w-10 h-10 text-primary" />
                            </div>
                        )}
                        {qrStatus === 802 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                <span className="font-bold text-green-600">Scanned! Confirm on phone</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="w-[180px] h-[180px] flex items-center justify-center bg-muted rounded-lg">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                )}
                <div className="text-center min-h-[20px]">
                    <p className={`text-sm ${qrStatus === 800 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {qrMessage}
                    </p>
                    {qrStatus === 800 && (
                        <Button variant="link" size="sm" onClick={handleRefreshQr}>
                            Refresh QR Code
                        </Button>
                    )}
                </div>
             </div>

             {/* Right: Manual Cookie */}
             <div className="space-y-4">
               <div className="text-sm font-medium text-muted-foreground">Or enter cookie manually</div>
               <div className="space-y-2">
                 <Label>MUSIC_U Cookie</Label>
                 <Input 
                   value={cookieInput} 
                   onChange={(e) => setCookieInput(e.target.value)} 
                   placeholder="Paste your MUSIC_U cookie here..."
                 />
                 <p className="text-xs text-muted-foreground leading-relaxed">
                    1. Open <a href="https://music.163.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">music.163.com</a><br/>
                    2. Press F12 &rarr; Application &rarr; Cookies<br/>
                    3. Copy 'MUSIC_U' value
                 </p>
               </div>
               <Button className="w-full" onClick={handleManualLogin} disabled={loading}>
                 {loading ? <Loader2 className="animate-spin h-4 w-4"/> : 'Verify & Login'}
               </Button>
             </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
