export function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function MessageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

type RowActionsProps = {
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
};

export function RowActions({
  onEdit,
  onDelete,
  editTitle = "Modifica",
  deleteTitle = "Elimina",
}: RowActionsProps) {
  return (
    <>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="w-7 h-7 rounded-lg hover:bg-bg-section flex items-center justify-center text-text-gentle hover:text-accent transition-all shrink-0"
          title={editTitle}
        >
          <EditIcon />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-7 h-7 rounded-lg hover:bg-coral/10 flex items-center justify-center text-coral transition-all shrink-0"
          title={deleteTitle}
        >
          <TrashIcon />
        </button>
      )}
    </>
  );
}
