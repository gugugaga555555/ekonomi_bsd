// ranks_data.js -- Sumber tunggal data RANKS
// File ini tidak meng-import apapun, sehingga aman di-import dari mana saja tanpa circular dependency

export const RANKS = [
    { id: 0, badge: "§7[Warga Biasa]", shortBadge: "§7[W]", name: "Warga Biasa", cost: 0, discount: 0 },
    { id: 1, badge: "§a[Pedagang]", shortBadge: "§a[P]", name: "Pedagang", cost: 5000000, discount: 0.05 },
    { id: 2, badge: "§b[Juragan]", shortBadge: "§b[J]", name: "Juragan", cost: 25000000, discount: 0.10 },
    { id: 3, badge: "§d[Miliarder]", shortBadge: "§d[M]", name: "Miliarder", cost: 100000000, discount: 0.15 },
    { id: 4, badge: "§e§l[SULTAN]", shortBadge: "§e§l[S]", name: "Sultan", cost: 500000000, discount: 0.20 },
    { id: 5, badge: "§6§l[KONGLOMERAT]", shortBadge: "§6§l[K]", name: "Konglomerat", cost: 2000000000, discount: 0.25 }
];
