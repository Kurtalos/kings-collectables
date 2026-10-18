import { getCatalog, getOrders, getImportHistory } from "@/lib/catalog";
import { hasOwnerAccess, ownerProtectionEnabled } from "@/lib/admin-auth";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminLogin } from "@/components/admin-login";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await hasOwnerAccess())) return <AdminLogin/>;
  const [catalog, orders, history] = await Promise.all([
    getCatalog({ limit: 200 }), 
    getOrders(), 
    getImportHistory()
  ]);
  return (
    <AdminDashboard 
      initialProducts={catalog.products} 
      initialCollections={catalog.collections} 
      initialOrders={orders} 
      importHistory={history} 
      protectedOwner={ownerProtectionEnabled()}
    />
  );
}
