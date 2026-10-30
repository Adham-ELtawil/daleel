#include <bits/stdc++.h>
using namespace std;
#define int long long
#define FAST ios::sync_with_stdio(false); cin.tie(nullptr)
#define all(v) (v).begin(), (v).end()
#define rep(i, n) for (int i = 0; i < (n); ++i)
using vi = vector<int>;
template<class T> void readAll(vector<T> &v, int n) {
    rep(i, n) cin >> v[i];
}
signed main() {
    FAST;
    int n, k; cin >> n >> k;
    vi scores(n + 1, 0);
    readAll(scores, n);
    int count = 0;
    rep(i, n) if (scores[i] > 0 && scores[i] >= scores[k]) ++count;
    cout << count << '\n';
}
