import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { neteaseApi } from '@/lib/api/netease';

export function NetEaseToolsTab({ cookie, onPlaylistClick }: { cookie: string, onPlaylistClick: (p: any) => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleResolve = async () => {
    if (!url) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await neteaseApi.resolveUrl(url);
      setResult(res);
      toast.success(`Resolved: ${res.type} - ${res.id}`);
      
      if (res.type === 'playlist') {
           // We can simulate a playlist click
           onPlaylistClick({ id: res.id.replace('neplaylist_', ''), name: 'Resolved Playlist', coverImgUrl: '' });
      }
      
    } catch (e: any) {
      toast.error('Failed to resolve URL: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">URL Resolver</h3>
        <p className="text-sm text-muted-foreground">Paste a NetEase share URL to resolve its ID and Type.</p>
      </div>
      <div className="flex gap-2">
        <Input 
          value={url} 
          onChange={e => setUrl(e.target.value)} 
          placeholder="https://music.163.com/..." 
        />
        <Button onClick={handleResolve} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : 'Resolve'}
        </Button>
      </div>
      
      {result && (
        <Card>
          <CardHeader>
             <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
            {result.type === 'playlist' && (
                <Button className="mt-4" variant="outline" onClick={() => onPlaylistClick({ id: result.id.replace('neplaylist_', ''), name: 'Resolved Playlist', coverImgUrl: '' })}>
                    Open Playlist
                </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
