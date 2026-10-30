#include <iostream>
#include <vector>
using namespace std;
vector<int> terms;
int main() {
    int t; cin >> t;
    while (t--) {
        int n; cin >> n;
        for (int place = 1; n > 0; n /= 10, place *= 10)
            if (n % 10 != 0) terms.push_back((n % 10) * place);
        cout << terms.size() << '\n';
        for (int term : terms) cout << term << ' ';
        cout << '\n';
    }
}
