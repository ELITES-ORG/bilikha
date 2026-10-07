import type { CSSProperties } from 'react';

/*
 * Biliran's coastline (the main island, Maripipi and Higatangan), simplified
 * from OpenStreetMap data and projected equirectangular at 11.6°N into the
 * map's 1000 × 992 box. OpenStreetMap is ODbL: the credit in the home page
 * footer is a licence condition, not decoration.
 */
const ISLANDS = [
  'M380 656 384 691 382 705 376 708 390 709 396 716 420 769 435 763 451 771 461 795 465 823 489 856 518 871 517 879 509 885 513 895 523 901 522 905 539 921 566 925 562 941 570 950 603 953 611 961 613 953 626 947 627 958 631 960 636 956 637 944 667 936 665 917 671 917 668 914 685 917 683 929 690 944 699 931 719 925 734 924 754 932 778 920 784 923 779 933 783 936 802 920 819 931 863 934 892 918 908 897 923 885 933 893 935 877 959 835 963 796 960 791 969 775 962 765 962 749 927 718 902 707 875 686 860 620 838 609 825 591 830 548 794 479 768 455 756 423 755 403 717 388 691 389 683 378 674 377 659 364 605 349 589 332 572 323 500 336 474 320 449 323 388 348 370 352 364 349 354 358 338 355 305 388 301 387 301 380 299 387 289 390 283 386 269 401 265 390 255 393 252 387 249 401 236 401 243 421 259 422 268 430 289 432 304 450 305 472 293 487 306 506 313 504 328 511 346 528 351 541 353 585 386 602 392 612 395 629Z',
  'M190 39 171 48 164 60 149 61 143 76 135 76 129 109 133 125 147 132 155 152 177 163 184 175 213 182 221 174 245 166 270 147 276 136 277 69 270 52 246 47 228 35 208 41 193 31Z',
  'M43 689 56 722 75 702 89 697 81 690 71 658 59 647 35 648 31 654Z',
];

export function Coastline() {
  return (
    <svg viewBox="0 0 1000 992" className="absolute inset-0 size-full" focusable="false">
      {ISLANDS.map((d, index) => (
        <path
          key={d.slice(0, 12)}
          d={d}
          className="map-island fill-primary-soft stroke-lawa-300"
          style={{ '--i': index } as CSSProperties}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
