#include <new>
int main() {
    volatile char* p = new char[2147483648ULL];
    for (unsigned long long i = 0; i < 2147483648ULL; i += 4096) p[i] = 1;
    delete[] p;
}
