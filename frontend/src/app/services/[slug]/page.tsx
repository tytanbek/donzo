'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FiArrowLeft, FiInfo, FiShoppingCart, FiCheck, FiCopy, FiCreditCard } from 'react-icons/fi';
import { serviceAPI, orderAPI, paymentAPI, authAPI } from '@/lib/api';
import { useStore } from '@/lib/store';
import { PageSkeleton } from '@/components/Skeleton';
import PackageSelector from '@/components/PackageSelector';
import SmartForm from '@/components/SmartForm';
import PaymentMethodSelector from '@/components/PaymentMethodSelector';
import toast from 'react-hot-toast';

export default function ServiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const [service, setService] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerTelegram, setCustomerTelegram] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [step, setStep] = useState<'form' | 'payment' | 'processing' | 'success'>('form');
  // SECURITY/UX: an order is only truly paid after the balance charge
  // succeeds. Skipping payment must NEVER show the paid success screen.
  const [orderPaid, setOrderPaid] = useState(false);

  // Payment state
  const [paymentProviders, setPaymentProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);

  useEffect(() => {
    const fetchService = async () => {
      try {
        const res = await serviceAPI.detail(params.slug as string);
        setService(res.data);

        // ═══ Reorder prefill (arrived from /orders/<id> via 'Qayta buyurtma') ═══
        // Pre-fill package + customer + field values so the user can tweak and
        // resubmit the same order with one click. All values stay editable.
        // NOTE: read window.location.search directly instead of useSearchParams()
        // (which requires a Suspense boundary and can break `next build`).
        const searchParams = new URLSearchParams(window.location.search);
        const pkgId = searchParams.get('package');
        if (pkgId && res.data.packages) {
          const pkg = res.data.packages.find(
            (p: any) => String(p.id) === pkgId
          );
          if (pkg) setSelectedPackage(pkg);
        }
        const name = searchParams.get('name');
        if (name) setCustomerName(name);
        const tg = searchParams.get('tg');
        if (tg) setCustomerTelegram(tg);
        const prefilled: Record<string, string> = {};
        let hasFields = false;
        searchParams.forEach((v, k) => {
          if (k.startsWith('f_')) {
            prefilled[k.slice(2)] = v;
            hasFields = true;
          }
        });
        if (hasFields) setFormValues(prefilled);

        // ═══ Auto-fill from the logged-in user ═══
        // Telegram Premium: username avtomatik to'ldiriladi (foydalanuvchi
        // faqat to'lov qiladi). Qayta buyurtma (prefilled) bo'lsa — uniki ustun.
        if (user) {
          if (!name && user.first_name) setCustomerName(user.first_name);
          if (!tg && user.telegram_username) {
            setCustomerTelegram(user.telegram_username.startsWith('@') ? user.telegram_username : `@${user.telegram_username}`);
          }
          if (res.data.slug === 'telegram-premium') {
            setFormValues((prev) => ({
              ...prev,
              username: prev.username || user.telegram_username || user.username || '',
            }));
          }
        }
      } catch (e) {
        console.error('Error fetching service:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchService();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, user?.id]);

  // Fetch payment providers when entering payment step
  useEffect(() => {
    if (step === 'payment' && paymentProviders.length === 0) {
      const fetchProviders = async () => {
        try {
          const res = await paymentAPI.providers();
          setPaymentProviders(res.data);
        } catch (e) {
          toast.error("To'lov usullarini yuklashda xatolik");
          // Fallback providers
          setPaymentProviders([
            { id: 'balance', name: 'Balans', icon: '💰', description: "Hisobingizdagi mablag' orqali" },
          ]);
        }
      };
      fetchProviders();
    }
  }, [step, paymentProviders.length]);

  const handleFieldChange = (fieldName: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
    if (formErrors[fieldName]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!selectedPackage) {
      toast.error('Iltimos, paket tanlang');
      return false;
    }
    if (!customerName.trim()) {
      errors.customerName = 'Ism kiritish majburiy';
    }
    if (!customerTelegram.trim()) {
      errors.customerTelegram = 'Telegram username kiritish majburiy';
    }
    service?.fields?.forEach((field: any) => {
      if (field.is_required && !formValues[field.field_name]?.trim()) {
        errors[field.field_name] = `${field.field_label} kiritish majburiy`;
      }
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitOrder = async () => {
    if (!validate()) return;

    // Guests need an account to place an order — take them to the inline
    // login prompt (Profile page shows LoginGate) instead of a confusing 401.
    if (!isAuthenticated) {
      toast.error("Buyurtma berish uchun avval tizimga kiring", { duration: 4000 });
      router.push('/profile');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData = {
        service: service.id,
        package: selectedPackage.id,
        field_values: formValues,
        customer_name: customerName,
        customer_telegram: customerTelegram,
      };
      const res = await orderAPI.create(orderData);
      setCreatedOrder(res.data);
      toast.success('Buyurtma muvaffaqiyatli yaratildi!');
      setStep('payment');
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.';
      toast.error(msg, { duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (!selectedProvider) {
      toast.error('Iltimos, to\'lov usulini tanlang');
      return;
    }

    setIsPaying(true);
    try {
      const res = await paymentAPI.init({
        order_id: createdOrder.id,
        provider: selectedProvider,
      });
      setPaymentResult(res.data);

      // Balance payment is always instant — only NOW may we show the
      // paid success screen.
      setOrderPaid(true);
      // Refresh the profile so the header/balance badge shows the NEW balance
      // immediately (the store was snapshot at login — without this it stays
      // stale until the next page load).
      try {
        const profileRes = await authAPI.profile();
        setUser(profileRes.data);
      } catch { /* header falls back to stale balance; next reload fixes it */ }
      toast.success("To'lov balansdan amalga oshirildi!", { duration: 5000 });
      setStep('success');
    } catch (e: any) {
      const msg = e.response?.data?.detail || "To'lovni amalga oshirishda xatolik yuz berdi";
      toast.error(msg, { duration: 5000 });
    } finally {
      setIsPaying(false);
    }
  };

  const handleSkipPayment = () => {
    // The order is created but NOT paid — show the honest 'hali to'lanmagan'
    // screen (amber warning, amount + order number), never a paid success.
    setOrderPaid(false);
    setStep('success');
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!service) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Xizmat topilmadi</h2>
          <Link href="/" className="glow-btn-outline px-6 py-3 inline-flex items-center gap-2">
            <FiArrowLeft className="w-4 h-4" />
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    );
  }

  // Success / order-created step — branches on whether the order was REALLY
  // paid (balance charge succeeded) or still pending payment.
  if (step === 'success') {
    const paid = orderPaid;
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4 pt-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-8 text-center w-full max-w-md mx-auto"
        >
          {paid ? (
            <>
              <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
                <FiCheck className="w-10 h-10 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Buyurtma qabul qilindi!</h2>
              <p className="text-[#94A3B8] mb-6">To'lov balansdan amalga oshirildi.</p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-6">
                <FiInfo className="w-10 h-10 text-amber-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Buyurtma yaratildi — hali to'lanmagan</h2>
              <p className="text-[#94A3B8] mb-2">
                Buyurtmangiz saqlandi, lekin to'lov hali amalga oshirilmagan.
              </p>
              <p className="text-[#64748B] text-xs mb-6">
                To'lovni <span className="text-[#FBBF24]">Buyurtmalarim</span> bo'limidan yakunlashingiz mumkin.
              </p>
            </>
          )}

          <div className="glass-deep rounded-2xl p-4 mb-6 inline-block mx-auto">
            <p className="text-xs text-[#64748B] mb-1">Buyurtma raqamingiz</p>
            <div className="flex items-center gap-2 justify-center">
              <p className="text-xl font-mono font-bold neon-price">
                #{createdOrder?.order_number || ''}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdOrder?.order_number || '');
                  toast.success('Buyurtma raqami nusxalandi');
                }}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00E5FF] transition-all"
              >
                <FiCopy className="w-4 h-4" />
              </button>
            </div>
            {!paid && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-center gap-2">
                <p className="text-xs text-[#64748B]">To'lov summasi</p>
                <p className="text-sm font-semibold text-[#FBBF24]">
                  {Number(createdOrder?.total_price || selectedPackage?.price || 0).toLocaleString()} so'm
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {!paid && (
              <button
                onClick={() => setStep('payment')}
                className="pill-btn !py-3.5 !text-sm"
              >
                <FiCreditCard className="w-4 h-4" />
                Hozir to'lash
              </button>
            )}
            <Link href="/orders" className="pill-btn !py-3.5 !text-sm">
              Buyurtmalarim
            </Link>
            <Link href="/" className="pill-btn pill-btn-ghost !py-3.5 !text-sm">
              Bosh sahifa
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Payment Step
  if (step === 'payment') {
    return (
      <div className="px-4 pt-4 pb-6">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => setStep('form')}
              className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00E5FF] transition-colors duration-200 mb-8"
            >
              <FiArrowLeft className="w-4 h-4" />
              Orqaga
            </button>

            {/* Order Summary */}
            <div className="glass-card p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-4">Buyurtma ma'lumotlari</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#64748B]">Xizmat</span>
                  <span className="text-sm text-white font-medium">{service.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#64748B]">Paket</span>
                  <span className="text-sm text-white font-medium">{selectedPackage?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#64748B]">Mijoz</span>
                  <span className="text-sm text-white font-medium">{customerName}</span>
                </div>
                <div className="neon-divider !my-3" />
                <div className="flex justify-between items-center">
                  <span className="text-base text-white font-semibold">Jami to'lov</span>
                  <span className="text-xl font-bold neon-price">
                    {Number(selectedPackage?.price || 0).toLocaleString()} so'm
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="glass-card p-6 mb-6">
              <PaymentMethodSelector
                providers={paymentProviders}
                selected={selectedProvider}
                onSelect={setSelectedProvider}
                totalPrice={selectedPackage?.price || 0}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handlePay}
                disabled={isPaying || !selectedProvider}
                className="service-float-btn w-full justify-center !py-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPaying ? (
                  <div className="w-5 h-5 border-2 border-[#020617]/30 border-t-[#020617] rounded-full animate-spin" />
                ) : (
                  <>
                    <FiCreditCard className="w-5 h-5" />
                    Balansdan to'lash
                  </>
                )}
              </button>
              <button
                onClick={handleSkipPayment}
                className="text-sm text-[#64748B] hover:text-white transition-colors text-center py-2"
              >
                To'lovni keyin amalga oshirish
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Form Step
  return (
    <div className="px-4 pt-4 pb-6">
      <div className="max-w-md mx-auto space-y-4">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00E5FF] transition-colors duration-200"
        >
          <FiArrowLeft className="w-4 h-4" />
          Bosh sahifaga qaytish
        </Link>

          {/* Service Info — gradient neon hero with game logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="service-hero"
          >
            <div className="flex items-center gap-4">
              {service.image_url ? (
                <div className="service-hero-logo">
                  <img
                    src={service.image_url}
                    alt={service.name}
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="service-hero-logo">
                  <span className="text-2xl font-black text-[#00E5FF]">
                    {service.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="service-hero-title">{service.name}</h1>
                <p className="service-hero-sub">{service.description}</p>
                <span className="service-hero-badge">
                  <span className="w-2 h-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.9)] animate-pulse" />
                  Onlayn xizmat
                </span>
              </div>
            </div>
            {service.instruction_text && (
              <div className="service-hero-note">
                <FiInfo className="w-4 h-4 text-[#00E5FF] mt-0.5 flex-shrink-0" />
                <p>{service.instruction_text}</p>
              </div>
            )}
          </motion.div>

            {/* Package Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Paketni tanlang
                </h2>
                {selectedPackage && (
                  <span className="text-sm text-[#64748B]">
                    {Number(selectedPackage.price).toLocaleString()} so'm
                  </span>
                )}
              </div>
              {service.packages && service.packages.length > 0 ? (
                <PackageSelector
                  packages={service.packages}
                  selectedId={selectedPackage?.id || null}
                  onSelect={setSelectedPackage}
                />
              ) : (
                <p className="text-[#64748B] text-center py-8">Paketlar mavjud emas</p>
              )}
            </motion.div>

            {/* Dynamic Form */}
            {service.fields && service.fields.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6"
              >
                <h2 className="text-lg font-bold text-white mb-4">
                  Ma'lumotlarni kiriting
                </h2>
                <SmartForm
                  fields={service.fields}
                  values={formValues}
                  errors={formErrors}
                  onChange={handleFieldChange}
                  // Telegram Premium: username avtomatik to'ldiriladi va
                  // yashiriladi — faqat to'lov qilish qoladi. Username
                  // topilmasa maydon KO'RINADI va tahrirlanadi (foydalanuvchi
                  // o'zi kiritadi) — aks holda user tuzoqqa tushib qoladi.
                  hiddenFields={service.slug === 'telegram-premium' && formValues.username ? ['username'] : []}
                  readOnlyFields={service.slug === 'telegram-premium' && formValues.username ? ['username'] : []}
                />
              </motion.div>
            )}

          {/* Order Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="glass-card p-6"
            >
              <h3 className="text-lg font-bold text-white mb-4">Buyurtma</h3>

              {selectedPackage && (
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#64748B]">Xizmat</span>
                    <span className="text-sm text-white font-medium">{service.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#64748B]">Paket</span>
                    <span className="text-sm text-white font-medium">{selectedPackage.name}</span>
                  </div>
                  <div className="neon-divider !my-3" />
                <div className="flex justify-between items-center">
                  <span className="text-base text-white font-semibold">Jami</span>
                  <span className="text-xl font-bold neon-price">
                    {Number(selectedPackage.price).toLocaleString()} {selectedPackage.currency}
                  </span>
                </div>
                </div>
              )}

              {/* Customer Info */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Ismingiz <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ismingizni kiriting"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={`glass-input ${formErrors.customerName ? 'error' : ''}`}
                  />
                  {formErrors.customerName && (
                    <p className="text-xs text-red-400 mt-1">{formErrors.customerName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                    Telegram username <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="@username yoki +998..."
                    value={customerTelegram}
                    onChange={(e) => setCustomerTelegram(e.target.value)}
                    className={`glass-input ${formErrors.customerTelegram ? 'error' : ''}`}
                  />
                  {formErrors.customerTelegram && (
                    <p className="text-xs text-red-400 mt-1">{formErrors.customerTelegram}</p>
                  )}
                </div>
              </div>

            </motion.div>

            {/* Floating sticky summary — total + CTA always in reach */}
            <div className="service-float-bar">
              <div>
                <div className="service-float-label">Jami to'lov</div>
                <div className="service-float-price">
                  {selectedPackage
                    ? `${Number(selectedPackage.price).toLocaleString()} so'm`
                    : 'Paket tanlang'}
                </div>
              </div>
              <button
                onClick={handleSubmitOrder}
                disabled={isSubmitting || !selectedPackage}
                className="service-float-btn"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-[#020617]/30 border-t-[#020617] rounded-full animate-spin" />
                ) : (
                  <>
                    <FiShoppingCart className="w-5 h-5" />
                    Buyurtma berish
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-[#64748B] text-center !mt-3">
              Buyurtma berish orqali siz foydalanish shartlariga rozilik bildirasiz
            </p>
      </div>
    </div>
  );
}
