/** Loading / error placeholder for a page. */
export default function Status({ error }: { error?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center p-6 text-center">
      <p className={error ? 'text-danger' : 'text-muted'}>{error ?? 'Indlæser…'}</p>
    </div>
  );
}
