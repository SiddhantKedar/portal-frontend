import { User as UserIcon, Mail, Shield, Building2, Users } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

// Same text-size tokens used across PlantOverviewPage — kept local here since
// this page doesn't currently import that file's T object.
const T = {
  eyebrow: 'text-[11px] uppercase tracking-wider text-black/50 font-semibold',
  sectionTitle: 'text-[18px] font-semibold text-black tracking-tight',
}

function roleLabel(role?: string) {
  if (role === 'ADMIN') return 'Admin'
  if (role === 'INSTALLER') return 'Installer'
  if (role === 'CUSTOMER') return 'Customer'
  return role ?? '—'
}

function InfoRow({
  icon, label, value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="w-9 h-9 rounded-lg bg-black/[0.04] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className={T.eyebrow}>{label}</p>
        <p className="text-[14px] font-semibold text-black mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

export default function UserPage() {
  const { user } = useAuth()

  if (!user) return null

  const showInstaller = user.role === 'INSTALLER' || user.role === 'CUSTOMER'
  const showCustomer = user.role === 'CUSTOMER'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className={T.sectionTitle}>User Profile</h1>
        <p className="text-[13px] text-black/50 mt-1">Account details and role assignment</p>
      </div>

      <div className="border border-black/15 rounded-xl overflow-hidden">
        {/* Header strip — name + role pill */}
        <div className="flex items-center gap-4 px-6 py-6 border-b border-black/15 bg-black/[0.02]">
          <div className="w-14 h-14 rounded-full bg-[#e17100] flex items-center justify-center shrink-0">
            <UserIcon size={22} className="text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold text-black truncate">{user.full_name}</p>
            <span className="inline-flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-[#e17100]">
              <Shield size={12} strokeWidth={2.5} />
              {roleLabel(user.role)}
            </span>
          </div>
        </div>

        {/* Info rows */}
        <div className="px-6 divide-y divide-black/10">
          <InfoRow icon={<Mail size={16} className="text-black/60" />} label="Email" value={user.email} />

          {showInstaller && (
            <InfoRow
              icon={<Building2 size={16} className="text-black/60" />}
              label="Installer"
              value={user.installer_name ?? '—'}
            />
          )}

          {showCustomer && (
            <InfoRow
              icon={<Users size={16} className="text-black/60" />}
              label="Customer"
              value={user.customer_name ?? '—'}
            />
          )}
        </div>
      </div>
    </div>
  )
}