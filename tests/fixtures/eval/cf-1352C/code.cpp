#include <iostream>
using namespace std;
int main() {
    int t; cin >> t;
    while (t--) {
        long long n, k; cin >> n >> k;
        long long count = 0, value = 0;
        while (count < k) {
            ++value;
            if (value % n != 0) ++count;
        }
        cout << value << '\n';
    }
}
