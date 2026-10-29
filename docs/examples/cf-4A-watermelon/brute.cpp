#include <bits/stdc++.h>
using namespace std;
int main() {
    int w; cin >> w;
    bool ok = false;
    for (int a = 1; a < w; a++)
        if (a % 2 == 0 && (w - a) % 2 == 0) ok = true;
    cout << (ok ? "YES" : "NO") << "\n";
}
