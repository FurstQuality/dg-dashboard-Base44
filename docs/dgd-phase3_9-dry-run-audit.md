# Phase 3.9 — dry-run audit of 68 PDGA importer records

Taken before any change, 2026-10-02. Player 236190 holds all 68. `Legacy` = in the Statboard 12-month window; `V1` = only source of a rated combined round with an active DGD V1 event; V1.1 reads its own fresh PDGA data, so none affect it.

| Stored ID | Stored date | Stored event | Score | Rating | Real PDGA round | Real date | Days off | Combined round | Legacy | V1 | V1.1 | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1dbc7c42 | 2001-01-01 | 2026 PDGA Amateur Disc Golf Wo | 74 | 916 | 2026 PDGA Amateur Disc Golf World Champi R1 | 2026-08-11 | -9353 | 195130c7 | no | no | no | invalid_import_duplicate |
| 1158c146 | 2001-01-01 | 15th Annual Discraft's Ledgest | 58 | 895 | 15th Annual Discraft's Ledgestone Open p R1 | 2025-08-15 | -8992 | ffa38015 | no | no | no | invalid_import_duplicate |
| 17c1ce80 | 2001-01-01 | Discraft's Ledgestone Open | 63 | 868 | Discraft's Ledgestone Open R1 | 2024-08-02 | -8614 | 7cfed81a | no | no | no | invalid_import_duplicate |
| 2b7e62ee | 2001-01-01 | Portage Sanctioned Singles | 62 | 927 | Portage Sanctioned Singles R1 | 2026-06-02 | -9283 | e1542731 | no | no | no | invalid_import_duplicate |
| 23a2fe92 | 2001-01-01 | Discraft's Ledgestone Open pre | 67 | 927 | Discraft's Ledgestone Open presented by  R1 | 2026-07-31 | -9342 | 59d7a807 | no | no | no | invalid_import_duplicate |
| dfe479fa | 2001-01-01 | Missile Ridge Sunday Leagues | 56 | 935 | Missile Ridge Sunday Leagues R1 | 2026-05-24 | -9274 | 86d90e9d | no | no | no | invalid_import_duplicate |
| c460c449 | 2001-01-01 | 36th Channahon Classic | 58 | 841 | 36th Channahon Classic R1 | 2023-09-23 | -8300 | b9434b3d | no | no | no | invalid_import_duplicate |
| 1f057633 | 2001-02-01 | MA3 | 66 | 856 | living on the edge 2 R1 | 2023-07-15 | -8199 | 84a8bd10 | no | no | no | invalid_import_duplicate |
| 176b0dad | 2001-02-01 | 2026 PDGA Amateur Disc Golf Wo | 63 | 945 | 2026 PDGA Amateur Disc Golf World Champi R2 | 2026-08-11 | -9322 | 5416fc5e | no | no | no | invalid_import_duplicate |
| ebee2fbf | 2001-02-01 | Discraft's Ledgestone Open pre | 79 | 962 | Discraft's Ledgestone Open presented by  R2 | 2026-07-31 | -9311 | c11a665d | no | no | no | invalid_import_duplicate |
| eec94cd6 | 2001-02-01 | Duneland Singles Summer '26 | 75 | 933 | Duneland Singles Summer '26 R2 | 2026-07-01 | -9281 | 129d58da | no | no | no | invalid_import_duplicate |
| ac7187ff | 2001-02-01 | 15th Annual Discraft's Ledgest | 63 | 907 | 15th Annual Discraft's Ledgestone Open p R2 | 2025-08-15 | -8961 | e6cdf99a | no | no | no | invalid_import_duplicate |
| f0cea187 | 2001-02-01 | MA1 | 54 | 910 | Flight of the Turkeys 2 R1 | 2024-11-24 | -8697 | 8ef04418 | no | no | no | invalid_import_duplicate |
| 41b03bf2 | 2001-02-01 | Discraft's Ledgestone Open | 68 | 843 | Discraft's Ledgestone Open R2 | 2024-08-02 | -8583 | 9440355f | no | no | no | invalid_import_duplicate |
| 8c1f852e | 2001-02-01 | MA3 | 60 | 833 | Freeze Ur Bellz Off Open 2 R2 | 2023-12-02 | -8339 | a95e7222 | no | no | no | invalid_import_duplicate |
| edb4b327 | 2001-02-01 | MA3 | 69 | 832 | Battle on the river 2 R2 | 2023-10-14 | -8290 | d8057e38 | no | no | no | invalid_import_duplicate |
| d187d9ec | 2001-02-01 | MA3 | 58 | 858 | Freeze Ur Bellz Off Open 2 R1 | 2023-12-02 | -8339 | a9ac8423 | no | no | no | invalid_import_duplicate |
| 198c7cb0 | 2001-02-01 | 36th Channahon Classic | 56 | 866 | 36th Channahon Classic R2 | 2023-09-23 | -8269 | fd610998 | no | no | no | invalid_import_duplicate |
| 130fb234 | 2001-02-01 | MA3 | 68 | 834 | living on the edge 2 R2 | 2023-07-15 | -8199 | 849615f0 | no | no | no | invalid_import_duplicate |
| c8bca74e | 2001-02-01 | MA3 | 64 | 942 | Hidden Lake Havoc Region Rumble #2 R1 | 2023-05-13 | -8136 | 07e91fe4 | no | no | no | invalid_import_duplicate |
| ae7c5e18 | 2001-02-01 | MA3 | 77 | 819 | Hidden Lake Havoc Region Rumble #2 R2 | 2023-05-13 | -8136 | 7202593a | no | no | no | invalid_import_duplicate |
| fd98ab3b | 2001-02-01 | Portage Sanctioned Singles | 64 | 907 | Portage Sanctioned Singles R2 | 2026-06-02 | -9252 | c232502b | no | no | no | invalid_import_duplicate |
| f507d638 | 2001-03-01 | MA2 | 63 | 906 | Battle on the River 3 R2 | 2024-09-08 | -8592 | 313d8baa | no | no | no | invalid_import_duplicate |
| 3cbfc2ea | 2001-03-01 | 2026 PDGA Amateur Disc Golf Wo | 78 | 924 | 2026 PDGA Amateur Disc Golf World Champi R3 | 2026-08-11 | -9294 | aaae7892 | no | no | no | invalid_import_duplicate |
| 8ea71a47 | 2001-03-01 | RAD | 54 | 952 | Flight of the Turkeys 3 R1 | 2025-11-23 | -9033 | da194d1c | no | no | no | invalid_import_duplicate |
| d263b9b9 | 2001-03-01 | Discraft's Ledgestone Open pre | 58 | 922 | Discraft's Ledgestone Open presented by  R3 | 2026-07-31 | -9283 | faf1e1fe | no | no | no | invalid_import_duplicate |
| e7439dff | 2001-03-01 | Portage Sanctioned Singles | 67 | 919 | Portage Sanctioned Singles R3 | 2026-06-02 | -9224 | e359c2b3 | no | no | no | invalid_import_duplicate |
| 6b876a19 | 2001-03-01 | 15th Annual Discraft's Ledgest | 53 | 919 | 15th Annual Discraft's Ledgestone Open p R3 | 2025-08-15 | -8933 | 13c1cc9a | no | no | no | invalid_import_duplicate |
| 0ed37e5c | 2001-03-01 | Duneland Singles Summer '25 | 72 | 881 | Duneland Singles Summer '25 R3 | 2025-07-02 | -8889 | 4e09a039 | no | no | no | invalid_import_duplicate |
| 5def7ad9 | 2001-03-01 | MA1 | 54 | 905 | Freeze Ur Bellz Off Open 3 R1 | 2024-12-07 | -8682 | cf04d3f6 | no | no | no | invalid_import_duplicate |
| 9abda1b2 | 2001-03-01 | MA1 | 52 | 929 | Freeze Ur Bellz Off Open 3 R2 | 2024-12-07 | -8682 | e6e16c50 | no | no | no | invalid_import_duplicate |
| 655741af | 2001-03-01 | MA2 | 58 | 905 | Battle on the River 3 R1 | 2024-09-08 | -8592 | 9146213a | no | no | no | invalid_import_duplicate |
| cb384700 | 2001-03-01 | Discraft's Ledgestone Open | 52 | 931 | Discraft's Ledgestone Open R3 | 2024-08-02 | -8555 | 5cca5dae | no | no | no | invalid_import_duplicate |
| a536374f | 2001-03-01 | MA3 | 59 | 924 | living on the edge 3 R1 | 2024-07-14 | -8536 | 2d14a3ff | no | no | no | invalid_import_duplicate |
| 42026b78 | 2001-03-01 | MA3 | 70 | 807 | living on the edge 3 R2 | 2024-07-14 | -8536 | b2663c05 | no | no | no | invalid_import_duplicate |
| e17bcf6e | 2001-04-01 | MA1 | 51 | 966 | The Cedar Lake Classic RR#4 R1 | 2026-07-11 | -9232 | c0223f8d | no | no | no | invalid_import_duplicate |
| 4208e899 | 2001-04-01 | MA1 | 63 | 918 | The Cedar Lake Classic RR#4 R2 | 2026-07-11 | -9232 | 0fcb47b2 | no | no | no | invalid_import_duplicate |
| 86772fd7 | 2001-04-01 | Portage Sanctioned Singles | 61 | 937 | Portage Sanctioned Singles R4 | 2026-06-02 | -9193 | d20b6322 | no | no | no | invalid_import_duplicate |
| 911b0297 | 2001-04-01 | MA1 | 50 | 925 | Battle on the River 4 R1 | 2025-08-03 | -8890 | e8a142a9 | no | no | no | invalid_import_duplicate |
| bab42158 | 2001-04-01 | MA1 | 61 | 933 | Battle on the River 4 R2 | 2025-08-03 | -8890 | e7c0c1d9 | no | no | no | invalid_import_duplicate |
| 69fdac22 | 2001-04-01 | MA1 | 68 | 878 | Living on the Edge 4 R2 | 2025-06-21 | -8847 | 4757c516 | no | no | no | invalid_import_duplicate |
| 95562149 | 2001-04-01 | 9-Sep to 10-Sep-2023 | 81 | 856 | — | — | — | 69240d5f | no | no | no | invalid_import_duplicate |
| 640da762 | 2001-06-01 | Duneland Singles Summer '26 | 51 | 959 | Duneland Singles Summer '26 R6 | 2026-07-01 | -9161 | defa8228 | no | no | no | invalid_import_duplicate |
| 75bd72ff | 2001-06-01 | Portage Sanctioned Singles | 58 | 967 | Portage Sanctioned Singles R6 | 2026-06-02 | -9132 | 414ba501 | no | no | no | invalid_import_duplicate |
| 0064988c | 2001-06-01 | Duneland Singles Summer '25 | 67 | 883 | Duneland Singles Summer '25 R6 | 2025-07-02 | -8797 | d13fd7db | no | no | no | invalid_import_duplicate |
| 3690ebac | 2001-07-01 | Portage Sanctioned Singles | 64 | 944 | Portage Sanctioned Singles R7 | 2026-06-02 | -9102 | c232502b | no | no | no | invalid_import_duplicate |
| 33046fc7 | 2001-07-01 | Duneland Singles Summer '25 | 66 | 892 | Duneland Singles Summer '25 R7 | 2025-07-02 | -8767 | 93cd0a7d | no | no | no | invalid_import_duplicate |
| 23fe1b77 | 2001-08-01 | Portage Sanctioned Singles | 72 | 869 | Portage Sanctioned Singles R8 | 2026-06-02 | -9071 | 1717afbf | no | no | no | invalid_import_duplicate |
| f2b1a8cb | 2001-08-01 | Duneland Singles Summer '25 | 64 | 910 | Duneland Singles Summer '25 R8 | 2025-07-02 | -8736 | ed894cf2 | no | no | no | invalid_import_duplicate |
| 47dfc220 | 2001-09-01 | Duneland Singles Summer '25 | 60 | 944 | Duneland Singles Summer '25 R9 | 2025-07-02 | -8705 | 9af79396 | no | no | no | invalid_import_duplicate |
| 1438d720 | 2024-01-01 | 17-Jul to 4-Sep-2024 | 68 | 912 | Duneland Singles League Summer 2024 R6 | 2024-07-17 | -198 | 61cef21c | no | no | no | invalid_import_duplicate |
| c1fdbff8 | 2024-01-01 | 17-Jul to 4-Sep-2024 | 63 | 861 | Duneland Singles League Summer 2024 R8 | 2024-07-17 | -198 | bab8edb7 | no | no | no | invalid_import_duplicate |
| d481d879 | 2024-01-01 | 8-May to 10-Jul-2024 | 67 | 881 | Duneland Singles League Spring 2024 R6 | 2024-05-08 | -128 | 2a698c34 | no | no | no | invalid_import_duplicate |
| db04c333 | 2025-01-01 | 23-Apr to 25-Jun-2025 | 67 | 889 | — | — | — | 766a03b4 | no | no | no | invalid_import_duplicate |
| 33a92af6 | 2025-01-01 | 23-Apr to 25-Jun-2025 | 71 | 917 | Duneland Singles League Spring 2025 R10 | 2025-04-23 | -112 | b439281a | no | no | no | invalid_import_duplicate |
| 3bcc642a | 2025-01-01 | 23-Apr to 25-Jun-2025 | 65 | 909 | Duneland Singles League Spring 2025 R2 | 2025-04-23 | -112 | 7e141b3f | no | no | no | invalid_import_duplicate |
| c608c2ca | 2025-01-01 | 23-Apr to 25-Jun-2025 | 80 | 869 | Duneland Singles League Spring 2025 R5 | 2025-04-23 | -112 | c471834e | no | no | no | invalid_import_duplicate |
| 17c747d1 | 2025-01-01 | 23-Apr to 25-Jun-2025 | 78 | 885 | Duneland Singles League Spring 2025 R6 | 2025-04-23 | -112 | a7e88ca4 | no | no | no | invalid_import_duplicate |
| 820dd043 | 2026-01-01 | MPO | 62 | 954 | NWI Club Challenge 2026 R2 | 2026-09-05 | -247 | cc21c890 | yes | no | no | invalid_import_duplicate |
| fe5d5580 | 2026-01-01 | MPO | 63 | 945 | NWI Club Challenge 2026 R1 | 2026-09-05 | -247 | 869159f7 | yes | no | no | invalid_import_duplicate |
| 719e1470 | 2026-01-01 | 22-Apr to 24-Jun-2026 | 63 | 966 | Duneland Singles League Spring 2026 R6 | 2026-04-22 | -111 | 67b8c0e5 | yes | no | no | invalid_import_duplicate |
| a902cf9a | 2026-01-01 | 22-Apr to 24-Jun-2026 | 59 | 966 | Duneland Singles League Spring 2026 R3 | 2026-04-22 | -111 | d25ee685 | yes | no | no | invalid_import_duplicate |
| a8b0c175 | 2026-01-01 | 22-Apr to 24-Jun-2026 | 64 | 917 | Duneland Singles League Spring 2026 R4 | 2026-04-22 | -111 | 51af2a53 | yes | no | no | invalid_import_duplicate |
| 63fb963d | 2026-01-01 | 22-Apr to 24-Jun-2026 | 78 | 896 | Duneland Singles League Spring 2026 R5 | 2026-04-22 | -111 | 50e3a9e6 | yes | no | no | invalid_import_duplicate |
| f5bd9a16 | 2026-01-01 | 22-Apr to 24-Jun-2026 | 53 | 948 | Duneland Singles League Spring 2026 R10 | 2026-04-22 | -111 | 39d33d85 | yes | no | no | invalid_import_duplicate |
| 6e4e732a | 2026-06-01 | MA1 | 48 | 955 | Marquette June Classic 2026 R1 | 2026-06-03 | -2 | 731c9e87 | yes | yes | no | invalid_import_duplicate |
| a4a9ba4c | 2026-06-01 | MA1 | 49 | 942 | Marquette June Classic 2026 R2 | 2026-06-03 | -2 | 15df52a2 | yes | yes | no | invalid_import_duplicate |
| 0fe902df | 2026-07-26 | (blank) | 79 | 927 | — | — | — | 5f7cbeb6 | yes | yes | no | pending_source_review |
