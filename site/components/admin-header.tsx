export function AdminHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-header">
      <div>
        <p className="admin-kicker">{kicker}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="admin-actions">{actions}</div>}
    </header>
  );
}
