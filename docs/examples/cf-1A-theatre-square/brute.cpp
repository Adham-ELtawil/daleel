#include <bits/stdc++.h>
using namespace std;
int main() {
    long long n, m, a; cin >> n >> m >> a;
    long long x = 0, y = 0;
    for (long long c = 0; c < n; c += a) x++;   // brute: count tiles along n
    for (long long c = 0; c < m; c += a) y++;
    cout << x * y << "\n";
}
