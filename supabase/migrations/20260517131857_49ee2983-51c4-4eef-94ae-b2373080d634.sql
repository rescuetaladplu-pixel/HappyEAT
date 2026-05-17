DROP POLICY IF EXISTS "Slip read by order parties" ON storage.objects;

CREATE POLICY "Slip read by order parties"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-slips'
  AND EXISTS (
    SELECT 1
    FROM orders o
    LEFT JOIN restaurants r ON r.id = o.restaurant_id
    WHERE (o.id)::text = (storage.foldername(objects.name))[1]
      AND (
        o.customer_id = auth.uid()
        OR r.owner_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
      )
  )
);