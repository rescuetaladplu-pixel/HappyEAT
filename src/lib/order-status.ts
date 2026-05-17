// Centralised order status labels & variants for QR-payment flow

export type OrderStatus =
  | "pending"
  | "awaiting_confirmations"
  | "awaiting_restaurant"
  | "awaiting_payment"
  | "awaiting_payment_confirm"
  | "payment_rejected"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "รอร้านยืนยัน",
  awaiting_confirmations: "รอร้าน + ไรเดอร์ยืนยัน",
  awaiting_restaurant: "รอร้านเช็คความพร้อม",
  awaiting_payment: "รอชำระเงิน",
  awaiting_payment_confirm: "รอร้านตรวจสลิป",
  payment_rejected: "สลิปถูกปฏิเสธ",
  accepted: "ร้านรับออเดอร์",
  preparing: "กำลังทำอาหาร",
  ready: "พร้อมส่ง",
  picked_up: "ไรเดอร์รับงาน",
  delivering: "กำลังส่ง",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

export const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  awaiting_confirmations: "secondary",
  awaiting_restaurant: "secondary",
  awaiting_payment: "default",
  awaiting_payment_confirm: "default",
  payment_rejected: "destructive",
  accepted: "default",
  preparing: "default",
  ready: "default",
  picked_up: "default",
  delivering: "default",
  delivered: "outline",
  cancelled: "destructive",
};
