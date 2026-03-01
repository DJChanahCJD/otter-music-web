import { KeyManageTab } from "@/components/admin/KeyManageTab";

export default function AdminPage() {
  return (
    <div className="container mx-auto py-8 max-w-2xl px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Otter Music Admin</h1>
        <p className="text-muted-foreground mt-2">
          Manage your music synchronization keys and settings.
        </p>
      </div>
      
      <div className="bg-card rounded-xl border shadow-sm p-6">
        <KeyManageTab />
      </div>
    </div>
  );
}
