declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    vfs?: Record<string, string>;
    createPdf: (doc: unknown) => { download: (name: string) => void };
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: {
    pdfMake?: { vfs: Record<string, string> };
  };
  export default vfs;
}
