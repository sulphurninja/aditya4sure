export default function PagesLayout({ children }: { children: React.ReactNode }) {
  return <div className="relative z-10 mx-auto w-full max-w-[1200px] px-5 pb-16 pt-20 md:px-10 lg:pt-14">{children}</div>;
}
