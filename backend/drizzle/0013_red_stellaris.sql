DO $$
BEGIN
  -- Portfolio items become one "Portfolio" offer per profile, and only then is
  -- the table dropped. This lives in SQL rather than in the migrate:offers
  -- script because `db:migrate` applies every pending migration in a single
  -- pass on deploy: there is no moment between "offers exists" and
  -- "portfolio_items is gone" in which a separate command could run. Doing it
  -- here makes the move and the drop atomic.
  --
  -- Conditional, so it is a no-op where the table has already been dropped.
  IF to_regclass('public.portfolio_items') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO offers (profile_id, subdomain_id, title, sort_order)
  SELECT DISTINCT pi.profile_id, sd.subdomain_id, 'Portfolio', 0
  FROM portfolio_items pi
  -- Primary sub-domain when there is one, otherwise the oldest. Registration
  -- guarantees at least one, so this never fails to find a row.
  JOIN LATERAL (
    SELECT cps.subdomain_id
    FROM creative_profile_subdomains cps
    WHERE cps.profile_id = pi.profile_id
    ORDER BY cps.is_primary DESC, cps.created_at
    LIMIT 1
  ) sd ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM offers o
    WHERE o.profile_id = pi.profile_id AND o.title = 'Portfolio'
  );

  -- Keys are carried across byte-identical: the objects are not moving, so
  -- rewriting a key here would orphan the image it points at.
  INSERT INTO offer_images (offer_id, object_key, thumb_key, sort_order)
  SELECT o.id, pi.object_key, pi.thumb_key, pi.sort_order
  FROM portfolio_items pi
  JOIN offers o ON o.profile_id = pi.profile_id AND o.title = 'Portfolio'
  WHERE NOT EXISTS (
    SELECT 1 FROM offer_images oi
    WHERE oi.object_key = pi.object_key AND oi.thumb_key = pi.thumb_key
  );

  -- Refuse to drop while any row would be left behind. Aborting the migration
  -- fails the deploy, which is the safe direction: the alternative is silently
  -- losing images that no longer have a row pointing at them.
  IF EXISTS (
    SELECT 1 FROM portfolio_items pi
    WHERE NOT EXISTS (
      SELECT 1 FROM offer_images oi
      WHERE oi.object_key = pi.object_key AND oi.thumb_key = pi.thumb_key
    )
  ) THEN
    RAISE EXCEPTION 'portfolio_items rows would be lost - aborting the drop';
  END IF;

  DROP TABLE portfolio_items CASCADE;
END $$;
