/**
 * A synthetic transcript in the exact layout Populi produces for UATX,
 * including the quirks the parser has to survive:
 *   - a course code whose number wraps onto the following line
 *   - a wrapped code where the course name also continues on that line
 *   - in-progress rows carrying an "IP" grade and 0.00 earned credits
 *   - a "Resident" summary line used to cross-check the parse
 * No real student's record appears in this repository.
 */
export const SAMPLE_TRANSCRIPT = `
                              University of Austin                       Student: Example, Student
                                                                        Student ID: 2025000000
RECIPIENT:                        Unofficial Transcript                   Birthdate: 2005/01/01

Undergraduate Program
Degrees
B.A.: Bachelor of Arts - Pursuing as of 09/02/2025
Major: Liberal Studies
2025-2026: Fall 2025 - 09/08/2025 - 11/21/2025
Course      Name                                            Attempted             Earned          Grade      Points
                                                               Credits            Credits
ALT 1010    The Rise and Fall of Ancient Rome                     3.00               3.00             92      276.00
INF 1210    Writing and the English Language                      3.00               3.00             95      285.00
STM         Special Topics: Accelerated Introduction to           3.00               3.00             95      285.00
3910C       Programming
Totals                                                           9.00               9.00     Term GPA:  Cumulative GPA:
                                                                                                 94.00            94.00
2025-2026: Winter 2026 - 01/05/2026 - 03/20/2026
Course Name                                                  Attempted           Earned             Grade      Points
                                                                Credits          Credits
ALT    Special Topics in Ethics and Politics: Political            1.50             1.50                88      132.00
4500   Theology
STM      Statistics                                                4.50             4.50                94      423.00
2102
POL 1110 Polaris Ideas                                             3.00             3.00                85      255.00
Totals                                                             9.00             9.00     Term GPA:  Cumulative GPA:
2026-2027: Fall 2026 - 08/31/2026 - 11/17/2026
Course    Name                                   Attempted Credits Earned Credits        Grade         Points
INF 1320 Intellectual Foundations of Economics                3.00           0.00             IP          0.00
MATH 210 Linear Algebra                                       3.00           0.00             IP          0.00
Totals                                                        6.00           0.00 Term GPA: 0.00 Cumulative GPA: 0.00
Program Summary
                             Attempted Credits          Earned Credits      Grade Points      GPA
Resident                                24.00                   18.00           1,656.00     92.00

Produced by Populi - 08/31/2026                Page 1 of 1
`;
