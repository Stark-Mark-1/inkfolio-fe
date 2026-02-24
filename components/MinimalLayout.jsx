export default function MinimalLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#F1E9D2] text-[#111111]">
      <div className="mx-auto max-w-[1040px] px-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
